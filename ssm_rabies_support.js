/* CONSTANTS */
var universe = 'U';

/* CONVENIENCE FUNCs */
// sum(varargs) : return a string join of the varargs w/ separator '+'
function sum() { return Array.prototype.slice.call(arguments).join('+'); }

// describe(thing, as) : updates a js object in place to have a property "description : as";
// returns the modified obj
function describe(thing, as) {
	thing.description = as;
	return thing;
}

/* REACTION BUILDERS */
// flow(from, rate, to = universe) : return a formated reaction from->to, at rate
function flow(from, rate, to) {
	to = to || universe;
	return { from:from, rate:rate, to:to };
}

// birth(rate, to) : creates a flow universe->to, at rate
function birth(rate, to) { return flow(universe, rate, to); }

// track(flow, as) : updates flow to include tracking;
// returns the flow obj
function track(flow, as) {
	flow.tracked = [].concat(as);
	return flow;
}

// rxns(popname, varargs) : given a population name and varargs of reactions on that population
// generate formatted model object
function rxns(popname) {
	var rxn = Array.prototype.slice.call(arguments,1);
	var ref = [];
	for(var i = rxn.length-1; i >= 0; i--){
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
	return { population:[{ name:popname, composition:pop }], reactions:rxn };
}

// popMerge(varargs) : merge the results from multiple calls to rxns into a single model
function popMerge() {
	var pops = Array.prototype.slice.call(arguments);
	var res = { population:[], reactions:[] };
	for (var i = pops.length-1;i>=0;i--) {
		res.population.push(pops[i].population);
		res.reactions.push(pops[i].reactions);
	}
	return res;
}

/* INPUT BUILDERS */
// parameter(name) : returns a formated parameter object
function parameter(name) {
	return { name:name, require:{ resource:name } };
}

// transformed(param, toModel, toData, dataName) :
// updates a param object to provide a map to/from a data src rather than directly providing param
function transformed(param, toModel, toData, dataName) {
	param.transformation = toModel;
	param.to_resource = toData;
	param.require.resource = dataName;
	return param;
}

/* DISTRIBUTION HELPERS */
function dUniform(lower, upper) { return { distribution:'uniform', lower : lower, upper : upper }; }
function dUnifProb() { return dUniform(0,1); }
function dFixed(value) { return { distribution:'fixed', value : value }; }
function dNormal(mean, sd) { return { distribution:'discretized_normal', mean : mean, sd : sd }; }

/* OBSERVATION BUILDER */
function observation(name, start, dist) {
	// TODO CHECK FORMAT
	return { name : name, start: start, distribution : dist };
}

// measurement(name, measureField, src, timeField='date',timeSrc=src)
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

// TODO add noise(param, ...) to update a parameter with noising

/* RESOURCE BUILDERS */
function arbSrc(name) {
	var pairs = Array.prototype.slice.call(arguments,1);
	var res = { name: name, data:[] };
	for (var i = 0; i < pairs.length; i = i+2 ) {
		res.data.push({ resource:pairs[i], field:pairs[i+1] });
	}
	return res;
}

function dataSrc(name, resource, field, dateField, dateResource) {
	return arbSrc(name, resource, field, dateField || 'date', dateResource || resource);
}

// function prior(name,dist,distparams) {
// 	var res = {
// 		name : name,
// 		data : { distribution:dist }
// 	};
// 	for (var key in distparams) if (distparams.hasOwnProperty(key)) res.data[key] = distparams[key];
// 	return res;
// }

function prior(name,dist) {
	return { name : name, data : dist };
}

// want schema({name:type}, {name:type}, ...)
function schema() {
	var fieldPairs = Array.prototype.slice.call(arguments);
	var inner = [];
	for (var i=fieldPairs.length-1; i>=0; i--) {
		// extract name
		inner.unshift({ name: vv, type: vt });
	}
	return { fields : inner };
}

function resourcer(name, path, schema, format){
	return [{ name:name, path:path, schema:schema, format:format||'csv' }];
}

// covars(varargs) :
function simpleCovars() {
	var covs = Array.prototype.slice.call(arguments);
	var res = {};
	for (var i = 0; i < covs.length; i++) {
		var item = {};
		item[covs[i]] = 0.2;
		res[covs[i]] = item;
	};
}

/* RABIES MODEL SETUP */

// name the compartment states
var states = {
	adults:"Sa",
	juveniles:"Sj",
	exposed:"E",
	exposedN:function(n){ // makes boxcars for exposed class
		var res = [];
		for (var i=0; i<n; i++) res.push("E"+i);
		return res;
	},
	infectious:"I"
};

// assorted relevant rates
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

// convenience functions that are rabies model specific
var exposure = function(src) { return flow(src, rates.infection, states.exposed) }
var death = function(src) { return flow(src, rates.death.normal); }

var probs = {
	observation : {
		rabid:"p_obs_rabid",
		normal:"p_obs_normal",
	}
};

// not used
// var tracks = {
// 	rabies : "positives",
// 	normal : "negatives"
// };

var model = rxn(
	birth(rates.birth, states.juveniles), // model birth
	flow(states.juveniles, rates.maturation, states.adults), // maturation
	exposure(states.adults), // adult exposure
	exposure(states.juveniles), // juvenile exposure
	flow(states.exposed, rates.incubation, states.infectious), // incubation
	flow(states.infectious, rates.death.rabies), // disease death
	death(states.infectious), // infectious general death
	death(states.exposed), // exposed general death
	death(states.adults), // adult general death
	death(states.juveniles) // juvenile general death
);

var periods = {
	maturation:"maturation_period",
	avelife:"average_lifespan",
	rablife:"rabid_lifespan",
	incubation:"incubation_period"
};

// map model+obs params + state initial conditions
// to priors (optionally via transformation)
var inputs = [
	transformed(parameter(rates.maturation), "1/"+periods.maturation, "1/"+rates.maturation),
	parameter("k"),
	transformed(parameter(rates.death.normal), "1/"+periods.avelife, "1/"+rates.death.normal),
	transformed(parameter(rates.death.rabies), "1/"+periods.rablife, "1/"+rates.death.rabies),
	transformed(parameter(rates.incubation), "1/"+periods.incubation, "1/"+rates.incubation),
	parameter("beta"),
	parameter(states.adults),
	parameter(states.juveniles),
	parameter(states.infectious),
	parameter(states.exposed),
	parameter(probs.observation.rabid),
	parameter(probs.observation.normal)
];


// can be a function of t
var observations = [
	observation("positive_reports", "1981-12-01", dNormal(
		probs.observation.rabid+"*"+states.infectious,
		"sqrt("+probs.observation.rabid+"*(1-"+probs.observation.rabid+")*"+states.infectious+")"
	)),
	observation("negative_reports", "1981-12-01", dNormal( 
		probs.observation.normal+"*"+states.infectious,
		"sqrt("+probs.observation.normal+"*(1-"+probs.observation.normal+")*("+sum(states.adults, states.juveniles, states.exposed)+"))"
	))
];



var priors = [
	prior(dataSrc.periods.maturation, dUniform(0.5*365, 1.5*365) ),
	prior("k", dUniform(1,5)),
	prior(periods.avelife, dUniform(2*365, 5*365)),
	prior(periods.rablife, dUniform(1,365)),
	prior(periods.incubation, dUniform(1,365)),
	prior("beta", dUniform(0,1) ),
	prior(states.adults, dUniform(1,10000)),
	prior(states.juveniles, dUniform(1,10000)),
	prior(states.infectious, dUniform(1,10000)),
	prior(states.exposed, dUniform(1,10000)),
	prior(probs.observation.rabid, dUnifProb()),
	prior(probs.observation.normal, dUnifProb())
];

var data = [
	dataSrc("positive_reports","reports","positives"),
	dataSrc("negative_reports","reports","negatives")
];

var resources = 
resourcer("reports","PATHTODATA",
	schema({ date:"date" },{ positives:"number" },{ negatives:"number" }));

var covar = simpleCovars(
	"k",
	periods.maturation,
	periods.avelife,
	periods.rablife,
	periods.incubation,
	"beta",
	probs.observation.rabid,
	probs.observation.normal
);

var result = {
	model: model,
	inputs: inputs,
	resources: priors.concat(data)
	observations: observations
};

console.log(JSON.stringify(result));