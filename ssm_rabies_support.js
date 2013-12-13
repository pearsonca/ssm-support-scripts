function sum() {
	return Array.prototype.slice.call(arguments).join("+");
}

function flow(from, rate, to) {
	to = to || 'U';
	return { from:from, rate:rate, to:to };
}

function track(flow, as) {
	flow.tracked = [as];
	return flow;
}

function describe(flow, as) {
	flow.description = as;
	return flow;
}

function birth(rate, to) { flow('U',rate,to) }

function rxns(popname) {
	var rxn = Array.prototype.slice.call(arguments);
	var ref = [];
	for(var i = rxn.length-1; i >= 0; --i){
		if(rxn[i].to != 'U') ref.push(rxn[i].to);
		if(rxn[i].from != 'U') ref.push(rxn[i].from);
	}
	var u = {}, pop = [];
	for(var i = ref.length-1; i >= 0; --i){
		if(u.hasOwnProperty(ref[i])) { continue; }
	    pop.push(ref[i]);
	    u[ref[i]] = 1;
	}
	// extract the state vars by extracting from/tos, then uniquing them
	return { population:{ name:popname, composition:pop }, reactions:rxn };
}

var states = {
	adults:"Sa",
	juveniles:"Sj",
	exposed:"E",
	exposedN:["E0","E1"],
	infectious:"I"
};

var rates = {
	birth:"k*sin(2*PI/365*t)*"+states.adults,
	maturation:"lambda",
	infection:"beta*"+states.infectious,
	incubation:"sigma",
	death:{
		normal:"mu",
		rabies:"nu"
	}
};

var probs = {
	observation : {
		rabid:"p_obs_rabid",
		normal:"p_obs_normal",
	}
};

var tracks = {
	rabies : "positives",
	normal : "negatives"
};

var exposure = function(src) { flow(src, rates.infection, states.exposed) }

var death = function(src) { flow(src, rates.death.normal); }

var model = [
	birth(rates.birth, states.juveniles),
	flow(states.juveniles, rates.maturation, states.adults),
	exposure(states.adults),
	exposure(states.juveniles),
	flow(states.exposed, rates.incubation, states.infectious),
	flow(states.infectious, rates.death.rabies),
	death(states.infectious),
	death(states.exposed),
	death(states.adults),
	death(states.juveniles)
];

function parameter(name) {
	return { name:name, require:{ resource:dataname } };
}

function transformed(param, toModel, toData, dataName) {
	param.transformation = toModel;
	param.to_resource = toData;
	param.require.resource = dataName;
	return param;
}

function measurement(name, measureField, src, timeField, timeSrc) {
	timeField = timeField || "date";
	timeSrc = timeSrc || src;
	return { name:name, require:[{
		resource:src,
		field:measureField
	},{
		resource:timeSrc,
		field:timeField
	}]};
}

var dataSrc = {
	periods:{
		maturation:"maturation_period",
		avelife:"average_lifespan",
		rablife:"rabid_lifespan",
		incubation:"incubation_period"
	}
}

// map model+obs params + state initial conditions
// to priors (optionally via transformation)
var inputs = [
	transformed(parameter(rates.maturation), "1/"+dataSrc.periods.maturation, "1/"+rates.maturation),
	parameter("k"),
	transformed(parameter(rates.death.normal), "1/"+dataSrc.periods.avelife, "1/"+rates.death.normal),
	transformed(parameter(rates.death.rabies), "1/"+dataSrc.periods.rablife, "1/"+rates.death.rabies),
	transformed(parameter(rates.incubation), "1/"+dataSrc.periods.incubation, "1/"+rates.incubation),
	parameter("beta"),
	parameter(states.adults),
	parameter(states.juveniles),
	parameter(states.infectious),
	parameter(states.exposed),
	parameter(probs.observation.rabid),
	parameter(probs.observation.normal)
];

function observation(name, start, dist, distparams) {
	var res = {
		name:name,
		start:start,
		distribution:dist
	};
	for (var key in distparams) if (distparams.hasOwnProperty(key)) {
		res[key] = distparams[key]
	}
	return res;
}

// can be a function of t
var observations = [
	observation("positive_reports", "1981-12-01", "discretized_normal", { 
		mean: probs.observation.rabid+"*"+states.infectious,
		sd:"sqrt("+probs.observation.rabid+"*(1-"+probs.observation.rabid+")*"+states.infectious+")";
	}),
	observation("negative_reports", "1981-12-01", "discretized_normal", { 
		mean: probs.observation.normal+"*"+states.infectious,
		sd:"sqrt("+probs.observation.normal+"*(1-"+probs.observation.normal+")*("+sum(states.adults, states.juveniles, states.exposed)+"))";
	})
];

function prior(name,dist,distparams) {
	var res = {
		name:name,
		data:{
			distribution:dist
		}
	};
	for (var key in distparams) if (distparams.hasOwnProperty(key)) {
		res.data[key] = distparams[key]
	}
	return res;
}

var priors = [
	prior(dataSrc.periods.maturation, "uniform", { upper:0.5*365, lower: 1.5*365 }),
	prior("k", "uniform", { upper:5, lower:1 }),
	prior(dataSrc.periods.avelife, "uniform", { upper:5*365, lower:2*365 }),
	prior(dataSrc.periods.rablife, "uniform", { upper:365, lower:1 }),
	prior(dataSrc.periods.incubation, "uniform", { upper:365, lower:1 }),
	prior("beta", "uniform", { upper:1, lower:0 }),
	prior(states.adults, "uniform", { upper:10000, lower:1 }),
	prior(states.juveniles, "uniform", { upper:10000, lower:1 }),
	prior(states.infectious, "uniform", { upper:10000, lower:1 }),
	prior(states.exposed, "uniform", { upper:10000, lower:1 }),
	prior(probs.observation.rabid, "uniform", { upper:1, lower:0 }),
	prior(probs.observation.normal, "uniform", { upper:1, lower:0 })
];

function dataSrc(name, resource, field, dateField) {
	dateField = dateField || 'date';
	return {
		name:name,
		data:[{ 
			resource: resource, field:dateField
		},{
			resource: resource, field:field
		}]
	};
}

var data = [
	dataSrc("positive_reports","reports","positives"),
	dataSrc("negative_reports","reports","negatives")
];

var resources = [{
      "name": "reports",
      "path": "PATHTODATA",
      "format": "csv",
      "schema": {
        "fields": [
          {
            "name": "date",
            "type": "date"
          },
          {
            "name": "positives",
            "type": "number"
          },
          {
            "name": "negatives",
            "type": "number"
          }
        ]
      }
    }];

var covar = { 
	k : { k : 0.02 }
};

var priors = [
	prior(dataSrc.periods.maturation, "uniform", { upper:0.5*365, lower: 1.5*365 }),
	prior("k", "uniform", { upper:5, lower:1 }),
	prior(dataSrc.periods.avelife, "uniform", { upper:5*365, lower:2*365 }),
	prior(dataSrc.periods.rablife, "uniform", { upper:365, lower:1 }),
	prior(dataSrc.periods.incubation, "uniform", { upper:365, lower:1 }),
	prior("beta", "uniform", { upper:1, lower:0 }),
	prior(states.adults, "uniform", { upper:10000, lower:1 }),
	prior(states.juveniles, "uniform", { upper:10000, lower:1 }),
	prior(states.infectious, "uniform", { upper:10000, lower:1 }),
	prior(states.exposed, "uniform", { upper:10000, lower:1 }),
	prior(probs.observation.rabid, "uniform", { upper:1, lower:0 }),
	prior(probs.observation.normal, "uniform", { upper:1, lower:0 })
];

var result = {
	model: model,
	inputs: inputs,
	resources: priors.concat(data)
	observations: observations
};

var covar = { mu:{ mu:0.02 } };