//###################################################################################################
// Autonomous Software Agents Project
// Project name: bitdeliver
// Authors: Emanuele Coppola && Mattias Trettel 
//###################################################################################################
// INDEX:
// (1) imported libraries
// (2) variables to set before execution (logs && PDDL files)
//                                                           (2a) variables to set
//                                                           (2b) support variables for logs
// (3) connection to server
// (4) main program section (intentions)
//                                      (4a) main variables
//                                      (4b) support variables 
//                                      (4c) main loop
//                                      (4d) pushing intention menagment
//                                      (4e) base intention class
//                                      (4f) init support functions
// (5) events menagment section
//                             (5a) onYou event
//                             (5b) config event
//                             (5c) map event
//                             (5d) agents event
//                             (5e) parcels event
//                             (5f) events support function
// (6) communications section
//                           (6a) communication variables
//                           (6b) communication event
//                           (6c) communication support function
// (7) option generation section
//                              (7a) option generation support variables
//                              (7b) option generator
//                              (7c) options generation support function
// (8) plan section
//                 (8a) base plan class
//                 (8b) single agent plan
//                 (8c) coop plan (sender part)
//                 (8d) coop plan (receiver part)
//                 (8e) random move plan (last resorse)
//                 (8f) plan variable
//                 (8g) plan support function
// (9) program launch
//###################################################################################################



//###################################################################################################
//(1) imported libraries
//###################################################################################################

import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder_2.mjs';
import { onlineSolver, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import fs from 'fs';





//###################################################################################################
//(2) variables to set before execution
//###################################################################################################

//---------------------------------------------------------------------------------------------------
//(2a) variables to set
//---------------------------------------------------------------------------------------------------

// to print logs
const logs = false;
const comms_logs = false;
const debug_logs = false;
//te save PDDL file 
const save_pddl = false; //in path


//---------------------------------------------------------------------------------------------------
//(2b) support variables for logs
//---------------------------------------------------------------------------------------------------

const path = './tmp';

if (save_pddl) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}

// colors for the logs
const resetColor = '\x1b[0m';
const colors = {                        // planner POST (white) + debug logs
    red: '\x1b[31m',                    // main loop
    green: '\x1b[32m',                  // planner   (not comms)
    yellow: '\x1b[33m',                 // events    (not comms)
    blue: '\x1b[34m',                   // option generator
    magenta: '\x1b[35m',                // intentions
    bgred: "\x1b[41m",                  // UNEXPECTED errors
    bggreen: "\x1b[42m",                // planner communications (sends && related replies [*])
    bgyellow: "\x1b[43m",               // event communications (incoming message && related replies [*])
    bgblue: "\x1b[44m",                 // handshake, beliefs && options communications (sends && related replies [*])
    bgmagenta: "\x1b[45m"               // replies ([*] -> subcolor to differentiate between sends && replies)
};

// UNEXPECTED error always printed
function print_error(error){
    console.log("⚠️⚠️⚠️ " + colors.bgred + "[ERROR]" + "\n\t" + error + resetColor);
}





//###################################################################################################
//(3) connection to server
//###################################################################################################

let token = ""
let name = ""
//dinamically set the name of the agent (default = bitdeliver)
if (process.argv[2] !== undefined) name = "?name=" + process.argv[2];
else name = "?name=bitdeliver";
if (process.argv[3] !== undefined) token = process.argv[3];

const client = new DeliverooApi(
    'http://localhost:8080/' + name,
    token
)





//###################################################################################################
//(4) main program section (intentions)
//###################################################################################################

//---------------------------------------------------------------------------------------------------
//(4a) main variables
//---------------------------------------------------------------------------------------------------

const beliefSet_agents = new Map();
const beliefSet_parcels = new Map();
const start = Date.now();

//create and initialize domains for planning
let domain;
let domain_coop;
init_domains();


const myMapBeliefset = [];              //for map PDDL instances
let grid = {};                          //binary grid for traking map situation

//map event
const map = {};                         //for store map info
let agent_delete_time = 0;              //to forget lost agents (set depends on map characteristics)

//config event
const config = {};                      //for store config info
let decay_time;                         //parcel decading time (set depends on config characteristics)

//onYou event
global.me = {};                         //for store my info


//---------------------------------------------------------------------------------------------------
//(4b) support variables 
//---------------------------------------------------------------------------------------------------

const preferable_tile_dimension = 4;                // to generate a list of preferable tiles to reach if no other options are available
const killing_time_for_next_step_of_plan = 2000;    // after that I stop following the plan
const minimum_time_to_delete_agent = 7000;          // to delete info of lost track agent         
const message_delay = 200;                          // minimum interval for sending info


//---------------------------------------------------------------------------------------------------
//(4c) main loop
//---------------------------------------------------------------------------------------------------

class IntentionRevision {

    #intention_queue = new Array();

    get intention_queue() {
        return this.#intention_queue;
    }

    async loop() {
        let loop_counter = 0;
        while (true) {
            if (logs) console.log(colors.red + "[main_loop] " + resetColor + "==================================================================>", loop_counter++);
            // if stuck following a plan
            if (plan_following_status.active && Date.now() - plan_following_status.last_message_received > killing_time_for_next_step_of_plan) {
                if (comms_logs) console.log(colors.red + "[main_loop]" + colors.bgred + "[comms]" + resetColor + " lost partner connection -> detaching");
                await this.remove_plan();
            }

            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                // Current intention
                const intention = this.intention_queue[0];

                // Start achieving intention
                if (logs) console.log(colors.red + "[main_loop] " + resetColor + 'try achiving -> ', intention);
                await intention.achieve()
                    // Catch eventual error and continue
                    .catch(error => {
                        if (logs) console.log(colors.red + "[main_loop] " + resetColor + 'Failed intention', ...intention.predicate, 'with error:', error);
                    })
                // Remove from the queue
                this.intention_queue.shift();
            } else { //no intention in queue -> generate options
                if (logs) console.log(colors.red + "[main_loop] " + resetColor + "No intention found -> regenerate options");
                option_generation(3);
            }
            // Postpone next iteration at setImmediate
            await new Promise(res => setImmediate(res));
        }
    }
}

//---------------------------------------------------------------------------------------------------
//(4d) pushing intention menagment
//---------------------------------------------------------------------------------------------------

class IntentionRevisionReplace extends IntentionRevision {
    // structure of predicate: [0] = intention, [1] = priority, [2] = location.x, [3] = location.y
    async push(predicate) {
        // current intention (intention queue length = 0 (empty), 1 (current intention), 2 (shift not done yet))
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        // if coop planning push the intention immediately
        if(predicate[0] != "generate_plan" && predicate[0] != "follow_plan"){
            if (last) {
                if (logs) console.log(colors.magenta + "[Intentions] " + resetColor + "check if replace -> " + last.predicate + " -- with -> " + predicate);
                if (last.predicate[0] == "go_to" && predicate[0] == "go_to") { //nothing else to do, don't change (Planner calls are expensive)
                    return;
                }
                // intention is already being achieved (update priority)
                else if ((last.predicate[0] == predicate[0]) && (last.predicate[2] == predicate[2]) && (last.predicate[3] == predicate[3])) {
                    last.predicate[1] = predicate[1];
                    return;
                }
                // current intention has higher priority
                else if (last.predicate[1] + 4 > predicate[1]) { //+ 4 to limit the Planner calls (axpensive)
                    return;
                }
                // Force current intention stop 
                last.stop();
            }
            else{
                if (logs) console.log(colors.magenta + "[Intentions] " + resetColor + "no last in the queue");
            }
        }
        //if random move alraady pushed then return
        if ([...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "random_move")) && predicate[0] == "random_move")
            return;
        // pushing new intention 
        if (logs) console.log(colors.magenta + "[Intentions] " + resetColor + "IntentionRevisionReplace.push " + predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);
    }
    //if loosing connection or after asking to release me (just for coop plan cases)
    async remove_plan() {
        const last = this.intention_queue[0];
        if (last && (last.predicate[0] == "generate_plan" || last.predicate[0] == "follow_plan")){
            if (logs) console.log(colors.magenta + "[Intentions] " + resetColor + "deleting plan execution");
            // Force current intention stop 
            last.stop();
            if (last.predicate[0] == "generate_plan") {
                try { reply_for_plan.reply({ msg: "stop" })
                } catch (error) { print_error(error); }
            } else if (last.predicate[0] == "follow_plan") {
                say_to_teammate("release_me", null);
            }
            this.intention_queue.shift();
        }
    }
}


//---------------------------------------------------------------------------------------------------
//(4e) base intention class
//---------------------------------------------------------------------------------------------------

class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;

    // This is used to stop the intention
    #stopped = false;
    get stopped() {
        return this.#stopped;
    }
    stop() {
        this.#stopped = true;
        if (this.#current_plan)
            this.#current_plan.stop();
    }

    #parent;

    get predicate() {
        return this.#predicate;
    }
    #predicate;

    constructor(parent, predicate) {
        this.#parent = parent;
        this.#predicate = predicate;
    }


    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve() {
        // Cannot start twice
        if (this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {
            if (this.stopped) throw ['[achive intent] stopped intention', ...this.predicate];
            if (planClass.isApplicableTo(this.predicate[0])) {
                this.#current_plan = new planClass(this.#parent);
                if(logs) console.log(colors.magenta + '[achive intent] ' + resetColor + 'achieving intention', ...this.predicate, 'with plan', planClass.name);
                try {
                    //if applicable plan found starting execution
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    if(logs) console.log(colors.magenta + '[achive intent] ' + resetColor + 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res;
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    if(logs) console.log(colors.magenta + '[achive intent] ' + resetColor + 'failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
                    if (!this.stopped) throw [error];
                }
            }
        }
        // if stopped then quit
        if (this.stopped) throw ['[achive intent] stopped intention', ...this.predicate];

        // no plans have been found to satisfy the intention
        throw ['[achive intent] no plan satisfied the intention', ...this.predicate];
    }

}


//---------------------------------------------------------------------------------------------------
//(4f) init support functions
//---------------------------------------------------------------------------------------------------

function init_domains(){ //to initialize both domains for PDDL
    //define actions
    const move = new PddlAction(
        'move',
        '?ag1 - agent ?from ?to - position',
        'and (on ?ag1 ?from) (near ?from ?to)',
        'and (on ?ag1 ?to) (not (on ?ag1 ?from))'
    );

    const grab = new PddlAction(
        'grab',
        '?ag1 - agent ?ob - package ?pos - position',
        'and (on ?ag1 ?pos) (on_pkg ?ob ?pos)',
        'and (holding ?ag1 ?ob) (not (on_pkg ?ob ?pos))'
    );

    const drop = new PddlAction(
        'drop',
        '?ag1 - agent ?ob - package ?pos - position',
        'and (on ?ag1 ?pos) (holding ?ag1 ?ob)',
        'and (not (holding ?ag1 ?ob)) (on_pkg ?ob ?pos)'
    );

    const move_coop = new PddlAction(
        'move_coop',
        '?ag1 ?ag2 - agent ?from ?to - position',
        'and (on ?ag1 ?from) (near ?from ?to) (not (on ?ag2 ?to)) (different ?ag1 ?ag2)',
        'and (on ?ag1 ?to) (not (on ?ag1 ?from))'
    );

    //define domain tmp
    let pddlDomain = new PddlDomain('bitdelivery-world');

    //add actions
    pddlDomain.addAction(move);
    pddlDomain.addAction(grab);
    pddlDomain.addAction(drop);

    //define predicates
    pddlDomain.predicates = [];
    pddlDomain.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain.addPredicate("on ?x - agent ?pos - position");
    pddlDomain.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain.addPredicate("near ?pos1 ?pos2 - position");

    //to save in files
    if (save_pddl) {
        pddlDomain.saveToFile();
    }

    //setting main variable
    domain = pddlDomain.toPddlString();

    //define domain tmp
    let pddlDomain_coop = new PddlDomain('bitdelivery-world_coop');

    //add actions
    pddlDomain_coop.addAction(move_coop);
    pddlDomain_coop.addAction(grab);
    pddlDomain_coop.addAction(drop);

    //define predicates
    pddlDomain_coop.predicates = [];
    pddlDomain_coop.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain_coop.addPredicate("on ?x - agent ?pos - position");
    pddlDomain_coop.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain_coop.addPredicate("near ?pos1 ?pos2 - position");
    pddlDomain_coop.addPredicate("different ?ag1 ?ag2 - agent");

    //to save in files
    if (save_pddl) {
        pddlDomain_coop.saveToFile();
    }
    //setting main variable
    domain_coop = pddlDomain_coop.toPddlString();
}



//###################################################################################################
//(5) events menagment section
//###################################################################################################


//---------------------------------------------------------------------------------------------------
//(5a) onYou event
//---------------------------------------------------------------------------------------------------

client.onYou(({ id, name, x, y, score }) => {
    if(logs) console.log(colors.yellow + "[onYou] " + resetColor + "receiving new position: (" + x + " - " + y + ")");
    global.me.id = id;
    global.me.name = name;
    global.me.x = x;        //Math.raund used later
    global.me.y = y;        //Math.raund used later
    global.me.score = score;
    updateFavoriteCoordinates();    //reset timer of near tiles (to go further && call Planner less (expensive))
})


//---------------------------------------------------------------------------------------------------
//(5b) config event
//---------------------------------------------------------------------------------------------------

client.onConfig((config_input) => {
    if(logs) console.log(colors.yellow + "[onConfig] " + resetColor + "receiving parameters", config_input);
    config.AGENTS_OBSERVATION_DISTANCE = config_input.AGENTS_OBSERVATION_DISTANCE;
    config.PARCELS_OBSERVATION_DISTANCE = config_input.PARCELS_OBSERVATION_DISTANCE;
    config.PARCEL_DECADING_INTERVAL = config_input.PARCEL_DECADING_INTERVAL;
    config.MOVEMENT_DURATION = config_input.MOVEMENT_DURATION;
    if (config.PARCEL_DECADING_INTERVAL == "infinite") decay_time = 0;
    else decay_time = parseInt(config.PARCEL_DECADING_INTERVAL.match(/\d+(\.\d+)?/)[0]) * 1000;     //set decay_time
})


//---------------------------------------------------------------------------------------------------
//(5c) map event
//---------------------------------------------------------------------------------------------------

client.onMap((width, height, tiles) => {
    if(logs) console.log(colors.yellow + "[onMap] " + resetColor + "receiving map");
    map.width = width;
    map.height = height;
    map.tiles = tiles;

    let delivery_tiles = [];
    let spawnable_tiles = [];
    grid = Array.from({ length: width }, () => Array.from({ length: height }, () => 1));
    for (let tile of tiles) {
        grid[tile.x][tile.y] = 0;
        if (tile.delivery) delivery_tiles.push(tile);
        if (tile.parcelSpawner) spawnable_tiles.push(tile);
    }
    map.delivery_tiles = delivery_tiles;
    map.spawnable_tiles = spawnable_tiles;

    //determine the time of deletion of agents
    agent_delete_time = map.width * map.height * config.MOVEMENT_DURATION / 10;
    if(agent_delete_time < minimum_time_to_delete_agent) agent_delete_time = minimum_time_to_delete_agent;

    //create favorite coordinates (as the destination of option go_to)
    map.favorite_coordinates = generate_favorite_coordinates();
    if(debug_logs) console.log(colors.yellow + "[onMap] " + resetColor + map.favorite_coordinates);

    //for PDDL Planner -> declare tiles location (near predicate)
    init_myMapBeliefset();
})



//---------------------------------------------------------------------------------------------------
//(5d) agents event
//---------------------------------------------------------------------------------------------------

client.onAgentsSensing((agents) => {
    if(logs) console.log(colors.yellow + "[onAgents] " + resetColor + "agent_sensing");
    let time = Date.now();
    for (let a of agents) {       //update info
        a.time = time;
        beliefSet_agents.set(a.id, a);
    }
    const idsToDelete = [];     //remove obsolete info
    for (const a of beliefSet_agents.values()) {
        if (!agents.some(agent => agent.id === a.id)) {
            //'a' should be here or too obsolete info
            if (distance_manhattan(global.me, a) <= config.AGENTS_OBSERVATION_DISTANCE || Date.now() - a.time > agent_delete_time) {
                if (logs) console.log(colors.yellow + "[onAgents] " + resetColor + "deleting agent memory (lost track):", a.name);
                idsToDelete.push(a.id);
            }
        }
    }
    for(const id of idsToDelete) { //delete obsolete info
        beliefSet_agents.delete(id);
    }
    if(logs && beliefSet_agents.size > 0) console.log(colors.yellow + "[onAgents] " +resetColor+ "memory agents:" + printBeliefAgents());
    //generate new options based on new belief
    option_generation(1);
})

//---------------------------------------------------------------------------------------------------
//(5e) parcels event
//---------------------------------------------------------------------------------------------------

client.onParcelsSensing(parcels => {
    if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "parcels_sensing");
    let time = Date.now();

    for (let p of parcels) {     //update info
        p.time = time;
        beliefSet_parcels.set(p.id, p);
    }
    const idsToDelete = [];     //remove obsolete info
    for (const p of beliefSet_parcels.values()) {
        if (p.reward < 2) { //not worth it
            if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "deleting parcel memory (expired nearby):", p);
            idsToDelete.push(p.id);
        }
        else if ((p.carriedBy) && (p.carriedBy !== global.me.id)) { //delete stolen parcel (partner's included)
            if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "deleting parcel memory (carried):", p);
            idsToDelete.push(p.id);
        }
        else if (!parcels.some(parcel => parcel.id === p.id)) {
            //'p' should be here or too obsolete info
            if (distance_manhattan(global.me, p) <= config.PARCELS_OBSERVATION_DISTANCE) {
                if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "deleting parcel memory (lost track):", p);
                idsToDelete.push(p.id);
            }
            else if (Date.now() - p.time > decay_time) { //updating reward of parcels not sensed
                p.reward -= Math.floor((Date.now() - p.time) / decay_time);
                if (p.reward > 2) { //worth keeping it
                    p.time = Date.now();
                    beliefSet_parcels.set(p.id, p);
                }
                else {  //not worth it
                    if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "delete parcel memory (expired somewhere):", p);
                    idsToDelete.push(p.id);
                }
            }
        }
    }
    for (const id of idsToDelete) { //remove parcels info
        beliefSet_parcels.delete(id);
    }
    if(logs && beliefSet_parcels.size > 0) console.log(colors.yellow + "[onParcels] " +resetColor+ "parcel_memory:" + printBeliefParcels());

    //generate new options based on new belief
    option_generation(2);
})


//---------------------------------------------------------------------------------------------------
//(5f) events support function
//---------------------------------------------------------------------------------------------------

// function to determine where are some preferable position to be, given the spawnable tiles
function generate_favorite_coordinates() {
    const temporaryGridMap = Array.from({ length: map.width }, () => Array(map.height).fill(0));
    let maxValue = -1;
    for (let tile of map.spawnable_tiles) {
        //create a rhombus araund spawnable tiles
        const { x, y } = tile;
        temporaryGridMap[x][y] += 1;  //to at least set maxValue to 2
        for (let i = x - preferable_tile_dimension; i <= x + preferable_tile_dimension; i++) {
            const deltaY = preferable_tile_dimension - Math.abs(i - x);
            for (let j = y - deltaY; j <= y + deltaY; j++) {
                if ((i >= 0) && (i < map.width) && (j >= 0) && (j < map.height)) {
                    temporaryGridMap[i][j] += 1;
                    if (temporaryGridMap[i][j] > maxValue) {
                        maxValue = temporaryGridMap[i][j];
                    }
                }
            }
        }
    }
    const resultList = [];
    for (let tile of map.spawnable_tiles) {
        const { x, y } = tile;
        const value = temporaryGridMap[x][y];
        if (value >= maxValue / 2) { //to reduce the list a bit
            resultList.push({ x, y, value, time: start });
        }
    }
    resultList.sort((a, b) => b.value - a.value);
    return resultList;
}

async function updateFavoriteCoordinates(){
    //reset timer of near tiles (to go further && call Planner less (expensive))
    for (let coordinates in map.favorite_coordinates) {
        if (distance_manhattan(global.me, coordinates) <= config.PARCELS_OBSERVATION_DISTANCE){
            coordinates.time = Date.now();
        }
    }
}

//init PDDL assumptions (near predicate for the tiles)
function init_myMapBeliefset() {
    for (let x = 0; x < grid.length; x++) {
        for (let y = 0; y < grid[0].length; y++) {
            if (grid[x][y] == 0) {
                if (x + 1 < grid.length && grid[x + 1][y] == 0) {
                    myMapBeliefset.push(`near p${x}_${y} p${x + 1}_${y}`);
                    myMapBeliefset.push(`near p${x + 1}_${y} p${x}_${y}`);
                }
                if (y + 1 < grid[0].length && grid[x][y + 1] == 0) {
                    myMapBeliefset.push(`near p${x}_${y} p${x}_${y + 1}`);
                    myMapBeliefset.push(`near p${x}_${y + 1} p${x}_${y}`);
                }
            }
        }
    }
}


//###################################################################################################
//(6) communications section
//###################################################################################################

//---------------------------------------------------------------------------------------------------
//(6a) communication variables
//---------------------------------------------------------------------------------------------------

// object that represent partner status 
let partner = 0;    //for partner position
global.communication = { partner_id: null, master: false }

var reply_for_plan = null;                                                  //to keep track of partner for coop plan
var last_message_sent = 0;                                                  //to keep track of communications
const refresh_time_for_plan = 200;                                          //waiting time to check partner response
const partner_update_time = 1000;                                           //waiting time to send beliefsets to partner
let send_belief_set                                                         //interval function to send beliefsets to partner (set below)

let forget_parcel_id = null;                                                //to ignore parcel being picked by partner
let plan_following_status = { active: false, last_message_received: 0 }     //for following partner intructions


//broadcast to let the other agent know that there is a connection available
const partner_interval = setInterval(
    function () {
        if (comms_logs) console.log(colors.bgblue + "[Shouting]" + resetColor + " searching partner");
        client.shout('🍗🍗🍗');
    }, 500);



//---------------------------------------------------------------------------------------------------
//(6b) communication event
//---------------------------------------------------------------------------------------------------

//communication between partners has protocol the exchange of messages  msg.type and msg.obj
client.onMsg(async (id, name, msg, reply) => {
    //teammate searching the partner (is allowed to reset the role in case the teammate crashed)
    if(msg == "🍗🍗🍗"){
        if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " handshake request");
        if(comms_logs) console.log(colors.bgyellow + "[onMsg]" + colors.bgmagenta + "[Asking]" + resetColor + " available for handshake, you?");
        let reply = await client.ask(id, '🐔🐔🐔');
        if (reply == "🐔🐔🐔"){
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " handshake accepted, setting roles");
            set_role(id);
        }
        else{
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " handshake rejected");
        }
    // The teammate handshake 
    }else if(msg == "🐔🐔🐔" && !global.communication.partner_id){
        if (reply) {// per protocol definition the teammate must use the ask method, so the field reply must be not null
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " handshake accepted, setting roles");
            try { reply("🐔🐔🐔") } catch { (error) => print_error(error) }
            set_role(id);
        }
        else{ print_error("the handshake didn't respect the protocol");
        }
    }else if(id == global.communication.partner_id) {//if is the partner
        if(msg.type == "beliefset_agents"){ //partner sent his agents beliefset
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor+ "partner agents beliefset");
            let obj = jsonToMap(msg.obj) 
            if(obj.size > 0) {
                if (debug_logs) console.log("[onMsg][debug] beliefset_agents before:", printBeliefAgents());
                for(const [key, a] of obj){
                    if(a.id == global.me.id){
                        continue;
                    }
                    if(beliefSet_agents.has(a.id)) {
                        //check for who has the last update on an agent
                        if (a.time > beliefSet_agents.get(a.id).time){
                            beliefSet_agents.set(a.id, a);
                        }
                    } else beliefSet_agents.set(a.id, a);
                }
                if(debug_logs) console.log("[onMsg][debug] beliefset_agents after:", printBeliefAgents());
            }
        } else if (msg.type == "beliefset_parcels"){ //partner sent his parcels beliefset
            if (comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor+ "partner parcels beliefset");
            let obj = jsonToMap(msg.obj)
            if (debug_logs) console.log("[onMsg][debug] beliefset_parcel before:", printBeliefParcels());
            if (obj.size > 0){
                for(const [key, a] of obj){
                    //check for who has the last update on a parcel
                    if(beliefSet_parcels.has(a.id)) {
                        if (a.time > beliefSet_parcels.get(a.id).time){
                            beliefSet_parcels.set(a.id, a);
                        }
                    } else beliefSet_parcels.set(a.id, a);
                }
                if(debug_logs) console.log("[onMsg][debug] beliefset_parcel after:", printBeliefParcels());
            }
        } else if(msg.type == "option_communication"){ //The partner sent the 2 most probable options that can became intentions (in order of priority)
            if(!reply) {
                print_error("message with no reply object");
                return;
            }
            let partner_options = msg.obj;
            if(comms_logs){ 
                console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " partner options:");
                for(const option of partner_options){ console.log("\t"+option);}
            }
            forget_parcel_id = null;    //to forget a parcel if the partner is going to pick it up (not generate the options for that parcel)
            let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1);
            if(current_intention){
                // if me and the partner have the same intention, check which one will have a higher priority on it
                // if i have the worst reward going somewhere I have to change intention
                if ((partner_options[0][0] == "go_to") && (current_intention.predicate[0] == partner_options[0][0]) && (current_intention.predicate[2] == partner_options[0][2]) && (current_intention.predicate[3] == partner_options[0][3])){
                    if (partner_options[0][1] > current_intention.predicate[1]) {   //parten has higher priority
                        if(debug_logs) console.log("[onMsg][debug] replying go_ahead");
                        reply({ type: "go_ahead" });
                    } else if (partner_options[1]) {    //I have higher priority && partner has a second option
                        if(debug_logs) console.log("[onMsg][debug] replying go_with_second");
                        reply({ type: "go_with_second" });
                    } else {    //I have higher priority && partner has not a second option
                        if(debug_logs) console.log("[onMsg][debug] replying generate_another");
                        reply({ type: "generate_another" });
                    }
                    // if there is a packet to pick up, if i'm nearer (higher priority) that i will go to pick it up and the other one must forget
                } else if (partner_options[0][0] == "go_pick_up") {
                    if ((current_intention.predicate[0] == partner_options[0][0]) && (current_intention.predicate[2] == partner_options[0][2]) && (current_intention.predicate[3] == partner_options[0][3])) {
                        if (partner_options[0][1] > current_intention.predicate[1]){
                            if(debug_logs) console.log("[onMsg][debug] replying go_ahead");
                            reply({ type: "go_ahead" })
                            current_intention.stop();
                            forget_parcel_id = partner_options[0][4];   //forget that parcel
                            option_generation(4);   //regenerate options
                        } else { // I have the higher priority or same priority but I'm already following a plan
                            if (partner_options[1]) { //partner has a second option
                                reply({ type: "go_with_second" });
                                if(debug_logs) console.log("[onMsg][debug] replying go_with_second");
                                forget_parcel_id = partner_options[1][4]
                            }
                            else {  //partner has not a second option
                                if(debug_logs) console.log("[onMsg][debug] replying generate_another");
                                reply({ type: "generate_another" });
                            }
                        }
                    } else { // different parcels
                        if(debug_logs) console.log("[onMsg][debug] replying go_ahead");
                        reply({ type: "go_ahead" });
                    }
                } else { // not mutual competitive intentions
                    if(debug_logs) console.log("[onMsg][debug] replying go_ahead");
                    reply({ type: "go_ahead" });
                }
            } else { //currently I don't have an intention
                if(debug_logs) console.log("[onMsg][debug] replying go_ahead");
                reply({ type: "go_ahead" });
            }
        } else if(msg.type == "you_block_me"){ // sent by partner to tell me that i'm blocking his action
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " I'm Blocking, partner asks for coop plan");

            let partner_options = msg.obj.options;
            let partner_status = msg.obj.status;
            // if i can do something else, than i will go forward for my way and ignore the partner
            let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1);
            if((current_intention != undefined) && (current_intention.predicate[0] == "go_deliver" || current_intention.predicate[0] == "go_pick_up") && (current_intention.predicate[1] - partner_options[0][1] > 2)){
                if(debug_logs) console.log("[onMsg][debug] replying I_ignore_you");
                reply({ type: "i_ignore_you" })
            } else {
                // if there isn't another plan related intention, lets' start a coop plan
                if(![...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan"))){
                    // preparing for the plan execution
                    if(debug_logs) console.log("[onMsg][debug] replying preparing coop plan");
                    reply_for_plan = { time: 0, status: "not_received" };
                    if(comms_logs) console.log(colors.bgyellow + "[onMsg]" + resetColor + " pushing coop plan option (generator)");
                    await myAgent.push(["generate_plan", 9999, partner_options[0], partner_status]);    //generate coop plan, max priority
                    reply({ type: "plan" });
                }
                else{
                    if(comms_logs) console.log(colors.bgyellow + "[onMsg]" + resetColor + " already following coop plan option");
                }
            }
        } else if(msg.type == "release_me"){    //partner wants to interrupt the coop plan
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " release_me");
            // the plan uses the await ask as a syncronization mechanism, so in case of any error the partner can ask me to reply to an ask
            try { reply_for_plan.reply({ msg: "stop" }) } catch (error) { print_error(error) }
            myAgent.remove_plan();
        } else if (msg.type == "following") { //partner is waiting orders
            if(comms_logs) console.log(colors.bgyellow + "[onMsg][Received]" + resetColor + " partner is waiting orders");
            // the plan uses the await ask as a syncronization mechanism,
            if ([...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "generate_plan"))){
                reply_for_plan = { time: Date.now(), reply: reply, msg: msg, status: "received" }
            }
            else{ //partner responce too late, assumed connection interruction occurred (or some error)
                if(comms_logs) console.log(colors.bgyellow + "[onMsg]" + colors.bgmagenta + "[Replying]" + resetColor + " too late, stop waiting orders");
                reply({ msg: "stop" });
            }
        } else { print_error("Partner message not supported:\n"+ msg)}
    } else{//non partner messages
        if(comms_logs){
            console.log(colors.bgyellow + "[onMsg][Received not from parner]" + resetColor + id, name, msg, reply);
        }
    }
});


//---------------------------------------------------------------------------------------------------
//(6c) communication support function
//---------------------------------------------------------------------------------------------------


// Defining the Master/Slave relationship based on the biggest string, bigger id is the master
function set_role(id) {
    if (global.me.id > id) {
        global.communication.master = true;
        if(comms_logs) console.log(colors.bgyellow + "[onMsg][comms info]" + resetColor + " I'm the Master");
        clearInterval(partner_interval);
    } else {
        global.communication.master = false;
        if(comms_logs) console.log(colors.bgyellow + "[onMsg][comms info]" + resetColor + " I'm the Slave");
        clearInterval(partner_interval);
    }
    global.communication.partner_id = id;

    //start to send periodic updates of the beliefsets
    send_belief_set = setInterval(
        function(){
            if(beliefSet_parcels.size > 0){
                say_to_teammate("beliefset_parcels", beliefSet_parcels);
            }
            beliefSet_agents.set(global.me.id, global.me);
            say_to_teammate("beliefset_agents", beliefSet_agents);
        }, partner_update_time);
}

// to avoid too many messages there is a timer in the 
function message_timer() {
    if (Date.now() - last_message_sent > message_delay) {
        last_message_sent = Date.now();
        return true;
    } else return false;
}

//send message without waiting an answere
function say_to_teammate(msg_type, obj) {
    let message = "";
    if (obj instanceof Map){
        message = mapToJSON(obj)
    }
    else{
        message = obj;
    }
    if(comms_logs) console.log(colors.bgblue + "[Message][Saying]" + resetColor, msg_type);
    client.say(global.communication.partner_id, { type: msg_type, obj: message });
}

//send message && waiting an answere
async function ask_teammate(msg_type, obj) {
    if(debug_logs) console.log("[Message][Asking][debug]", { type: msg_type, obj:obj });
    let message = "";
    if (obj instanceof Map){
        message = mapToJSON(obj);
    }
    else{
        message = obj;
    }
    if(comms_logs) console.log(colors.bgblue + "[Message][Asking]" + resetColor, msg_type);
    let reply = await client.ask(global.communication.partner_id, { type: msg_type, obj: message });
    if(comms_logs) console.log(colors.bgblue + "[Message]" + colors.bgmagenta + "[Response]" + resetColor, reply);
    return reply;
}


//conversion functions
function mapToJSON(map){
    const obj = Object.fromEntries(map);
    return JSON.stringify(obj);
}

function jsonToMap(jsonString){
    const obj = JSON.parse(jsonString);
    return new Map(Object.entries(obj));
}


//print functions
function printBeliefAgents() {
    let str = "";
    for (let [key,agent] of beliefSet_agents) {
        str+= "\n\t" + agent.name+": ("+ agent.x+","+ agent.y +")";
    }
    return str;
}
          
function printBeliefParcels(){
    let str = "";
    for (let [key,parcel] of beliefSet_parcels) {
        str+= "\n\t" + parcel.id+": ("+ parcel.x+","+ parcel.y +") "+ parcel.reward;
    }
    return str;
}


//###################################################################################################
//(7) option generation section
//###################################################################################################

//---------------------------------------------------------------------------------------------------
//(7a) option generation support variables
//---------------------------------------------------------------------------------------------------

const tiles_timeout = 4000;     //to not return to the same position to early
const norm_cost = 4;            //normalization costant -> tradeoff between decay_time & movement_time
const risk = 3;                 //(1...10) risk to not going directly to the biggest parcel
const stealing_modifier = 10    //(-10...10) risk to go to pick a parcel near an adversary (if<0 -> play aggressive)

//---------------------------------------------------------------------------------------------------
//(7b) option generator
//---------------------------------------------------------------------------------------------------

async function option_generation(caller_method_id) {

    if (logs) { // to identify the caller
        if (caller_method_id == 1) {
            console.log(colors.blue + "[opt_gen] " + resetColor + "agents call");
        }
        else if (caller_method_id == 2) {
            console.log(colors.blue + "[opt_gen] " + resetColor + "parcels call");
        }
        else if (caller_method_id == 3) {
            console.log(colors.blue + "[opt_gen] " + resetColor + "main loop call");
        }
        else if (caller_method_id == 4) {
            console.log(colors.blue + "[opt_gen] " + resetColor + "message handler call");
        }
    } 

    //compute options based on parcels (go_pick_up and go_deliver)
    let options = options_by_parcels();

    //no options generated
    if (options.length == 0){
        if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "no parcels options generated");
        if(global.communication.partner_id){ //partner available
            if(comms_logs) console.log(colors.bgblue + "[opt_gen]" + resetColor + " no options -> trying coop option");
            //tryng to generate options without considering the partner as an obstacle
            let options_2 = options_by_parcels(false); //generate go_pick_up and go_deliver options
            options_2.sort(function (a, b) { //sort options based on priority
                return b[1] - a[1];
            });
            //if now there are options starting procedure to create a coop plan (partner can refuse)
            if (options_2.length > 0 && options_2[0][0] == "go_deliver" && (![...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))) {
                if(comms_logs) console.log(colors.bgblue + "[opt_gen]" + resetColor + " found coop option -> asking partner");
                //asking and waiting partner opinion
                let reply = await ask_teammate("you_block_me", { status: global.me, options: options_2 });
                let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1);
                //partner accepted
                if (reply.type == "plan" && (current_intention === undefined // there can be multiple calls in parallel
                        || !(current_intention.predicate[0] == "follow_plan" || current_intention.predicate[0] == "generate_plan"))) {
                    if(comms_logs) console.log(colors.bgyellow + "[onMsg]" + resetColor + " pushing coop plan option (follower)");
                    await myAgent.push(["follow_plan", 9999, reply.obj]);
                    return;
                }
                else{ //partner refuses
                    if(comms_logs) console.log(colors.bgblue + "[opt_gen]" + resetColor + " partner rejected coop plan -> trying go_to");
                }
            }
        }
        else{// no partner
            if(comms_logs) console.log(colors.bgblue + "[opt_gen]" + resetColor + " no options -> partner unaveilable -> trying go_to");
        }
        // generate go_to options
        if(map.favorite_coordinates){
            let time = Date.now();
            let option_is_generated = false;
            for (let position of map.favorite_coordinates) {
                if (distance_manhattan(global.me, position) < 3) {
                    position.time = time;
                    continue;   //to close (planner calls are expensive)
                }
                if (position.time != start && time - position.time < tiles_timeout) {
                    continue;   //timeout (just passed by)
                }
                // using the distance path, if it returns null means that the agent cannot reach that point
                let distance = distance_path(global.me, position, true);
                if (distance){
                    options.push(["go_to", position.value - distance - 100, position.x, position.y]); //-100-> priority go_to < all others cases
                    option_is_generated = true;
                }
            }
            //to not let the agent stay still it will be generated a random move if no other action is available
            if(!option_is_generated) {
                if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "go_to options unaveilable -> random move");
                options.push(["random_move", -9999, -1, -1]);
            }
        }
        else{//no favorite_coordinates available
            if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "go_to options unaveilable -> random move");
            options.push(["random_move", -9999, -1, -1]);
        }
    }

    options.sort(function (a, b) { //sort options based on priority
        return b[1] - a[1];
    });

    //confrontation with the partner
    if (options[0]) { 
        // communicate the options
        if (global.communication.partner_id && (options[0][0] == "go_pick_up" || options[0][0] == "go_to")) {
            if (message_timer()){
                if(comms_logs) console.log(colors.bgblue + "[opt_gen]" + resetColor + " sharing options with partner");
                //waiting partner responce
                let reply = await ask_teammate("option_communication", options.slice(0, 2));
                if (reply.type == "go_with_second"){ //use second option
                    if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "pushing option: " + options[1]);
                    await myAgent.push(options[1]);
                    return;
                } else if(reply.type == "generate_another"){ 
                    if(options[0] == "go_pick_up"){ //regenerate without considering this parcel
                        forget_parcel_id = options[0][4];
                    }
                    else{ //regenerate without considering this position (resetting timer)
                        let selectedPosition = map.favorite_coordinates.find(position => position.x === options[0][2] && position.y === options[0][3]);
                        if (selectedPosition) {
                            selectedPosition.time = Date.now();
                        }
                    }
                    return; //to restart the generation
                } else if (reply.type != "go_ahead"){ //if there is some error
                    print_error("reply not supported" + reply);
                }
            }
        }
        if(map.favorite_coordinates){ //resetting timer of the options
            let selectedPosition = map.favorite_coordinates.find(position => position.x === options[0][2] && position.y === options[0][3]);
            if (selectedPosition) {
                selectedPosition.time = Date.now();
            }
        }
        //pushing best option
        if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "pushing best option: " + options[0]);
        await myAgent.push(options[0]);
    }
    else {//no options generated
        if(logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to generate any options");
    }
}

//---------------------------------------------------------------------------------------------------
//(7c) options generation support function
//---------------------------------------------------------------------------------------------------

// generate options for parcels
function options_by_parcels(consider_partner = true) {

    //Index:
    //option 1  go_deliver
    //option 2  go_pick_up parcel -> deliver
    //option 3  pick_up parcel2 -> pick_up parcel -> deliver    (option 2 + early deviation to parcel2)
    //option 4  deliver -> pick_up parcel
    //option 5  pick_up paarcel2 -> deliver -> pick_up parcel   (option 4 + early deviation to parcel2)

    compute_parcel_risk(); //risk of being stolen (depends on the proximity of the agents to the parcel)
    const options = [];
    let parcels_on_me_counter = 0; //# of parcels on me
    let parcels_on_me_reward = 0; //collective reward of parcels on me
    for (const parcel of beliefSet_parcels.values()) {   //process all parcels I'm carrying
        if (parcel.carriedBy == global.me.id) {
            parcels_on_me_reward += parcel.reward;
            parcels_on_me_counter += 1;
        }
    }
    /////////////////////////////////// compute go_deliver (option 1)
    if (parcels_on_me_counter) {
        let delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
        if (!delivery_point) { //not reachable
            if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find path to delivery from here ", global.me);
        }
        else {
            let priority;
            if (decay_time) { //based on decay time do different calculus (I'm less in a hurry to deliver if there is no decay time)
                //compute the lost of the reward
                priority = parcels_on_me_reward - (parcels_on_me_counter * delivery_point.distance) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
            }
            else {
                priority = parcels_on_me_reward;
            }
            //pushing go_deliver (option 1)
            options.push(['go_deliver', priority, delivery_point.x, delivery_point.y]);
            if (debug_logs) console.log("[opt_gen][debug] pushing go_deliver", delivery_point.x, delivery_point.y, "with priority:", priority ,"->", parcels_on_me_reward, "-", parcels_on_me_counter, delivery_point.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost);
        }
    }
    //compute option for parcels
    for (const parcel of beliefSet_parcels.values()) {
        if (parcel.carriedBy == global.me.id || parcel.id == forget_parcel_id || (parcel.carriedBy == global.communication.partner_id && global.communication.partner_id != null)) {          //We carry the parcel
            continue;   //parcel unavailable
        }
        else if (!parcel.carriedBy) {   //free parcel
            ///////////////////////////////////// compute go_pick_up parcel (-> deliver) (option 2)
            let distance_parcel = distance_path(global.me, parcel, consider_partner);    //and it is reachable?
            if (!distance_parcel) {
                if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find path to", parcel);
                continue; //not reachable
            }
            let delivery_point_from_parcel = get_nearest_delivery_point_path(parcel, consider_partner);
            if (!delivery_point_from_parcel && decay_time){ //and is deliverable? + there is a decay time?
                if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find nearest delivery point to", parcel);
                options.push(['go_pick_up', parcel.reward -parcel.stealing_risk - 30, parcel.x, parcel.y]); //do this if there is nothing else (better picking it up even if I can not deliver it)
                continue;
            }
            let base_priority;
            if (decay_time) {     //compute priority (the lost of the reward on the way)
                base_priority = parcel.reward + parcels_on_me_reward - (parcels_on_me_counter + 1) * (distance_parcel + delivery_point_from_parcel.distance) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
            }
            else {
                base_priority = parcel.reward + parcels_on_me_reward;
            }
            //pushing go_pick_up (option 2)
            options.push(['go_pick_up', base_priority -parcel.stealing_risk, parcel.x, parcel.y]);
            if (debug_logs) console.log("[opt_gen][debug] pushing go_pick_up", parcel.x, parcel.y, "with priority:", base_priority, "->", parcel.reward , parcels_on_me_reward, "-", parcels_on_me_counter+1, distance_parcel,"+",delivery_point_from_parcel.distance,
                decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost);

            ///////////////////////////////////// compute second parcel option: (pick up parcel2 first) (option 3)
            for (const parcel2 of beliefSet_parcels.values()) {
                if (parcel2.carriedBy || parcel2 === parcel || parcel2.id == forget_parcel_id) {
                    continue;   //stolen
                }
                //add deviation to the path
                let distance_parcel2 = distance_path(global.me, parcel2, consider_partner);
                let distance_parcel2_parcel = distance_path(parcel2, parcel, consider_partner);
                if (!distance_parcel2 || !distance_parcel2_parcel) {
                    continue; // ensure all paths are valid
                }
                let deviation_priority = parcel2.reward - (distance_parcel2 + distance_parcel2_parcel - distance_parcel) * risk
                if (deviation_priority < 0) {
                    continue; // check if it's worth
                }
                //pushing pick_up paarcel2 (-> pick_up parcel -> deliver) (option 3)
                options.push(['go_pick_up', base_priority + deviation_priority - parcel2.stealing_risk, parcel2.x, parcel2.y]);
            }

            /////////////////////////////////////compute go_deliver first (option 4)
            if (parcels_on_me_counter) {
                let delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
                if (!delivery_point){
                    continue;
                }
                base_priority = parcel.reward + parcels_on_me_reward - ((parcels_on_me_counter + 1) * delivery_point.distance + delivery_point_from_parcel.distance * 2) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
                //pushing go_deliver (-> pick_up parcel) (option 4)
                options.push(['go_deliver', base_priority, delivery_point.x, delivery_point.y]);
                if (debug_logs) console.log("[opt_gen][debug] pushing go_deliver", delivery_point_from_parcel.x, delivery_point_from_parcel.y, "with priority:", base_priority ,"->", parcel.reward , parcels_on_me_reward,
                   "-", parcels_on_me_counter+1, delivery_point.distance,"+",delivery_point_from_parcel.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)
                ///////////////////////////////////// compute second parcel option: (pick up parcel2 first) (option 5)
                for (const parcel2 of beliefSet_parcels.values()) {
                    if (parcel2.carriedBy || parcel2 === parcel || parcel2.id == forget_parcel_id) {
                        continue;
                    }
                    //add deviation to the path
                    let distance_parcel2 = distance_path(global.me, parcel2, consider_partner);
                    let distance_parcel2_delivery_point = distance_path(parcel2, delivery_point, consider_partner);
                    if (!distance_parcel2 || !distance_parcel2_delivery_point) {
                        continue; // ensure all paths are valid
                    }
                    let deviation_priority = parcel2.reward - (distance_parcel2 + distance_parcel2_delivery_point - delivery_point.distance) * risk
                    if (deviation_priority < 0) {
                        continue; // check if it's worth
                    }
                    //pushing pick_up paarcel2 (-> deliver -> pick_up parcel) (option 5)
                    options.push(['go_pick_up', base_priority + deviation_priority - parcel2.stealing_risk, parcel2.x, parcel2.y]);
                }
            }
        }
        else { //no options generated
            if (logs) print_error("[opt_gen] parcel unusable to generate option: " + parcel.id);
        }
    }
    return options;
}

//risk of being stolen by a near adversary
function compute_parcel_risk(){
    for (const parcel of beliefSet_parcels.values()) {
        let distance_parcel = distance_path(global.me, parcel, false);
        let min_agent_parcel_distance = config.AGENTS_OBSERVATION_DISTANCE+1;
        for (const agent of beliefSet_agents.values()) {
            let agent_parcel_distance = distance_path(agent,parcel, false);
            if(agent_parcel_distance && agent_parcel_distance < min_agent_parcel_distance){
                min_agent_parcel_distance = agent_parcel_distance;
            }
        }
        let stealing_risk = 0;
        if(distance_parcel > min_agent_parcel_distance){
            stealing_risk = (distance_parcel-min_agent_parcel_distance)*stealing_modifier;
        }
        parcel.stealing_risk = stealing_risk;
    }
}

// use an a* pathfinder to determine the effective distance between points
function distance_path(start_pos, end_pos, consider_partner_obstacle) {
    if (!grid) {
        return null;
    }
    let grid_copy = grid.map(row => [...row]);
    for (let agent of beliefSet_agents.values()) {
        if (agent != undefined) {
            try {
                if (global.me.id != agent.id && (consider_partner_obstacle || agent.id != global.communication.partner_id))
                    //mark obstacles on the grid
                    grid_copy[Math.round(agent.x)][Math.round(agent.y)] = 1;
            } catch (error) {
                print_error(error)
                return null;
            }
        }
    }

    let start = new Node(Math.round(start_pos.x), Math.round(start_pos.y), 0, 0);
    let end = new Node(Math.round(end_pos.x), Math.round(end_pos.y), 0, 0);
    let path = Pathfinder.aStar(grid_copy, start, end);

    if (path == null){
        return null;
    }
    else{
        return path.length;
    }
}



//compute the shortest PATH to a delivery point
function get_nearest_delivery_point_path(a, consider_partner_obstacle) {
    let min = Number.MAX_VALUE;
    let nearest_point = null;
    let distance = null;
    for (let delivery_point of map.delivery_tiles) {
        distance = distance_path(a, delivery_point, consider_partner_obstacle);
        if (distance == null) continue;
        if (distance < min) {
            min = distance;
            nearest_point = {
                x: delivery_point.x,
                y: delivery_point.y,
                distance: distance
            };
        }
    }
    return nearest_point;
}

//compute the manhattan distance between a && b
function distance_manhattan(a, b) {
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(b.y))
    return dx + dy;
}



//###################################################################################################
//(8) plan section
//###################################################################################################

//---------------------------------------------------------------------------------------------------
//(8a) base plan class
//---------------------------------------------------------------------------------------------------

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop() {
        this.#stopped = true;
        for (const i of this.#sub_intentions) {
            i.stop();
        }
    }
    get stopped() {
        return this.#stopped;
    }

    #parent;

    constructor(parent) {
        this.#parent = parent;
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.  (not used)
    #sub_intentions = [];

    async subIntention(predicate) {
        const sub_intention = new Intention(this, predicate);
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }
}


//---------------------------------------------------------------------------------------------------
//(8b) single agent plan
//---------------------------------------------------------------------------------------------------

class Plan_single extends Plan { // Plan for the sigle agent
    static isApplicableTo(intention) {
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_deliver');
    }

    async execute(intention, priority, x, y) {
        //generate a plan
        let plan = await generate_plan(intention, x, y, 0);
        if (logs) console.log(colors.green + "[plan] " + resetColor + "executing:", intention, priority, x, y)
        if (this.stopped) throw ['stopped'];
        if (!plan || plan.length === 0) { //plan not found
            if (logs) console.log(colors.green + "[plan] " + resetColor + "plan not found" + resetColor);
            throw ['failed (no single-plan found)'];
        }
        else {  //plan faound
            if (logs) console.log(colors.green + "[plan] " + resetColor + "plan found");
            for (let step of plan) { //execute plan step by step (parcing actions)
                if (this.stopped) throw ['stopped'];
                let action = step.action;
                if (action == "MOVE") { //parcing action (MOVE)
                    let [ag, from, to] = step.args;
                    if (logs) console.log(colors.green + "[plan] " + resetColor + " starting moving to", to);
                    const regex = /P(\d+)_(\d+)/;
                    const match = to.match(regex);
                    if (match) {
                        var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
                    }
                    else {
                        print_error(`Invalid position format: ${position}`);
                    }
                    await move(to);
                } else if (action == "GRAB") { //parcing action (GRAB)
                    let [ag, ob, pos] = step.args;
                    await client.pickup();
                    if (logs) console.log(colors.green + "[plan] " + resetColor + `${ag} grab ${ob} in ${pos}`);
                } else if (action == "DROP") { //parcing action (DROP)
                    let [ag, ob, pos] = step.args;
                    await client.putdown();
                    delete_put_down();
                    if (logs) console.log(colors.green + "[plan] " + resetColor + `${ag} drop ${ob} in ${pos}`);
                }
            }
            return "success";
        }
    }
}


//---------------------------------------------------------------------------------------------------
//(8c) coop plan (sender part)
//---------------------------------------------------------------------------------------------------

class Plan_coop extends Plan {

    static isApplicableTo(intention) {
        return (intention == 'generate_plan');
    }
    async execute(intention, priority, partner_option, partner_status) {
        if(logs) console.log(colors.green + "[plan] " + resetColor + "generating coop plan "+ reply_for_plan)
        //generate coop plan
        partner = { x: Math.round(partner_status.x), y: Math.round(partner_status.y), id: partner_status.id }
        let plan = await generate_plan(partner_option[0], partner_option[2], partner_option[3], true);

        if(this.stopped) throw ['stopped'];

        if(!plan || plan.length === 0){//plan not found
            if(logs) console.log(colors.green + "[plan] " + resetColor + "plan not found");
            if(comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " waiting partner response, time passed: " + Date.now() - reply_for_plan.time);
            while(reply_for_plan.reply == null) { //wait the partner to follow the orders
                if(Date.now() - reply_for_plan.time > killing_time_for_next_step_of_plan){
                    throw ['failed: no coop plan found and no reply obtained'];
                }
                // to avoid that node microcode doesn't let the events activate for the messages
                await sleep(500);
            }
            try { //send stop coop plan message
                if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " coop plan not found, stop waiting orders");
                reply_for_plan.reply("stop");
                if(debug_logs) console.trace();
            } catch (error) { print_error(error) }
            throw ['failed: no coop plan found'];
        }
        else { //plan found
            let reply = null;
            for(let step of plan) { //execute plan step by step (parcing actions)
                reply_for_plan.time = Date.now();
                //active loop for waiting the partner
                while (reply_for_plan.reply == null) {
                    if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " waiting partner reply, time passed: " + Date.now() - reply_for_plan.time);
                    if(debug_logs) console.trace();
                    if(reply_for_plan.msg.msg == "stop"){  //partner wants to stop the coop plan
                        if (comms_logs) console.log(colors.bggreen + "[plan comms][Response]" + resetColor + " partner interrupted coop plan");
                        reply_for_plan = { time: 0, status: "stopped" }
                        throw ["stopped by partner"];
                    }
                    if(Date.now() - reply_for_plan.time > killing_time_for_next_step_of_plan){ //partner response waiting time expired
                        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " no reply obtained in time");
                        throw ['failed: no reply obtained'];
                    }
                    // to avoid that node microcode doesn't let the events activate for the messages
                    await sleep(refresh_time_for_plan);
                    if(this.stopped){
                        if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " partner interrupted coop plan");
                        throw ["stopped by partner"];
                    }
                }
                if(comms_logs) console.log(colors.bggreen + "[plan comms][Response]" + resetColor + " reply obtained");
                reply = reply_for_plan.reply
                let action = step.action;
                if(action == "MOVE_COOP") { //parcing action (MOVE_COOP)
                    let [ag, ag2, from, to] = step.args;
                    if (ag == "PARTNER") { //instruction for partner
                        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " sending partner step");
                        // use the reply object to communicate since the partner is waiting for it
                        reply_for_plan.reply = null;
                        reply({ obj: step, msg: "go" });
                    }
                    else { //instruction for me
                        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " ordering partner to stay put");
                        // communicate to partner to stay put (don't let the partner time exire && don't let the partner assume that the connection was lost)
                        reply_for_plan.reply = null;
                        reply({ msg: "stay_put" });

                        if(logs) console.log(colors.green + "[plan]" + resetColor + " starting moving to", to);
                        try {
                            await move(to);
                        }
                        catch (error) { //error occurred -> stopped coop plan
                            while (reply_for_plan.reply == null) { 
                                if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " waiting partner reply, time passed: " + Date.now() - reply_for_plan.time);
                                if (debug_logs) console.trace();
                                if (Date.now() - reply_for_plan.time > killing_time_for_next_step_of_plan){
                                    if(comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " no reply obtained in time");
                                    throw ['failed: no reply obtained'];
                                }
                                // to avoid that node microcode doesn't let the events activate for the messages
                                await sleep(refresh_time_for_plan);
                                if(this.stopped){
                                    if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " partner interrupted coop plan");
                                    throw ["stopped by partner"];
                                }
                            }
                            if (reply_for_plan.msg == "stop"){ //partner already replied to stop
                                if (comms_logs) console.log(colors.bggreen + "[plan comms][Response]" + resetColor + " partner interrupted coop plan");
                                reply_for_plan = { time: 0, status: "stopped" }
                                throw ["stopped by partner"];
                            }
                            if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " move failed, stop coop plan");
                            //tell to the partner to stop the coop plan
                            reply_for_plan.reply({ msg: "stop" });
                            if (debug_logs)console.trace();
                            if (kill){
                                process.exit();
                            }
                            throw [error];
                        }
                    }
                } else if (action == "GRAB") { //parcing action (GRAB)
                    let [ag, ob, pos] = step.args;
                    if (ag == "PARTNER") {  //instruction for partner
                        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " sending partner step");
                        reply_for_plan.reply = null;
                        reply({ obj: step, msg: "go" });
                    }
                    else { //instruction for me
                        await client.pickup();
                        if (logs) console.log(colors.green + "[plan]" + resetColor + ` ${ag} grab ${ob} in ${pos}`);
                    }
                } else if (action == "DROP") { //parcing action (DROP)
                    let [ag, ob, pos] = step.args;
                    if (ag == "PARTNER") { //instruction for partner
                        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " sending partner step");
                        reply_for_plan.reply = null;
                        reply({ obj: step, msg: "go" });
                    }
                    else { //instruction for me
                        await client.putdown();
                        delete_put_down();
                        if (logs) console.log(colors.green + "[plan]" + resetColor + ` ${ag} drop ${ob} in ${pos}`);
                    }
                }
            }
            if(comms_logs) console.log(colors.bggreen + "[plan comms]" + colors.bgmagenta + "[Replying]" + resetColor + " coop plan completed");
            //coop plan finished -> sending stop message to partner
            reply_for_plan.reply({ msg: "stop" });
            return "success";
        }
    }
}


//---------------------------------------------------------------------------------------------------
//(8d) coop plan (receiver part)
//---------------------------------------------------------------------------------------------------

class Plan_receiver extends Plan {
    static isApplicableTo(intention) {
        return (intention == 'follow_plan');
    }

    async execute(intention, priority) {
        if (logs) console.log(colors.green + "[plan]" + resetColor + " starting receiver coop plan");
        //set plan follower variables
        plan_following_status.last_message_received = Date.now()
        plan_following_status.active = true

        while (plan_following_status.active) {
            if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " waiting orders");
            //wait instructions
            let reply = await client.ask(global.communication.partner_id, { type: "following", msg: "i'm here" });
            plan_following_status.last_message_received = Date.now()

            if (comms_logs) console.log(colors.bggreen + "[plan comms][Response]" + resetColor + " obtaing orders: " + reply.msg);
            if (reply.msg == "stop") {  //stop the coop plan (failed or completed)
                if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " stopping coop plan");
                plan_following_status.active = false;
            }
            if (reply.msg == "stay_put"){ //waiting new instruction (communication timer reset)
                if (comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " standing put");
                continue;
            }
            let step = reply.obj
            let action = step.action;
            //parceing actions
            if (action == "MOVE_COOP"){ //move action
                let [ag, ag2, from, to] = step.args;
                try { 
                    await move(to);
                }
                catch (error) {
                    client.say(global.communication.partner_id, { type: "following", msg: "stop" });
                    if(debug_logs){
                        console.trace();
                    }
                    throw [error];
                }
            } else if (action == "GRAB"){//grab action
                let [ag, ob, pos] = step.args;
                await client.pickup();
                if (logs) console.log(colors.green + "[plan]" + resetColor + ` ${ag} grab ${ob} in ${pos}`);
            } else if (action == "DROP"){ //drop action
                let [ag, ob, pos] = step.args;
                await client.putdown();
                delete_put_down();
                if (logs) console.log(colors.green + "[plan]" + resetColor + ` ${ag} drop ${ob} in ${pos}`);
            }
        }
        //plan finished
        if(comms_logs) console.log(colors.bggreen + "[plan comms]" + resetColor + " coop plan completed");
        return "terminated";
    }
}


//---------------------------------------------------------------------------------------------------
//(8e) random move plan (last resource)
//---------------------------------------------------------------------------------------------------

class RandomMove extends Plan {

    static isApplicableTo(intention) {
        return intention == 'random_move';
    }

    async execute(intention, priority, x, y) {
        const direction = getRandomDirection(); //get random direction
        if (logs) console.log(colors.green + "[plan] " + resetColor + "move randomly: ", direction);
        await client.move(direction);
        return "success";
    }
}


//---------------------------------------------------------------------------------------------------
//(8f) plan variable
//---------------------------------------------------------------------------------------------------

//plan library
const planLibrary = [];

// plan classes are added to plan library 
planLibrary.push(Plan_single);
planLibrary.push(Plan_coop);
planLibrary.push(Plan_receiver);
planLibrary.push(RandomMove);


//---------------------------------------------------------------------------------------------------
//(8g) plan support function
//---------------------------------------------------------------------------------------------------

async function generate_plan(intention, x, y, coop) {
    const myBeliefset = new Beliefset();
    for (let ob of myMapBeliefset) { //copying general map structure (near predicates for tiles (which tile is adjacent to which other))
        myBeliefset.declare(ob);
    }
    let goal = '';
    for (const agent_obj of beliefSet_agents) {
        //if a tile is blocked (by an opponent || partner in single case planner) remove the connections to the ones arount it to it
        // if I can't reach the tile, it's like removing it
        const agent = agent_obj[1];
        agent.x = Math.round(agent.x);
        agent.y = Math.round(agent.y);
        if ((coop && ((agent.id == global.communication.partner_id)) || agent.id == global.me.id)) {
            continue;
        }
        if (agent.x - 1 >= 0) {
            if (grid[agent.x - 1][agent.y] == 0) { //taglio solo il "ponte" di andata
                myBeliefset.undeclare(`near p${agent.x - 1}_${agent.y} p${agent.x}_${agent.y}`);
            }
        }
        if (agent.x + 1 < grid.length) {
            if (grid[agent.x + 1][agent.y] == 0) {
                myBeliefset.undeclare(`near p${agent.x + 1}_${agent.y} p${agent.x}_${agent.y}`);
            }
        }
        if (agent.y - 1 >= 0) {
            if (grid[agent.x][agent.y - 1] == 0) {
                myBeliefset.undeclare(`near p${agent.x}_${agent.y - 1} p${agent.x}_${agent.y}`);
            }
        }
        if (agent.y + 1 < grid[0].length) {
            if (grid[agent.x][agent.y + 1] == 0) {
                myBeliefset.undeclare(`near p${agent.x}_${agent.y + 1} p${agent.x}_${agent.y}`);
            }
        }
    }
    //set current situation info, intention and goal
    myBeliefset.declare(`on me p${Math.round(global.me.x)}_${Math.round(global.me.y)}`);
    if (!coop) { //single case
        if (intention == 'go_pick_up') {
            myBeliefset.declare(`on_pkg target p${x}_${y}`);
            goal = `holding me target`;
        }
        else if (intention == 'go_deliver') {
            myBeliefset.declare(`holding me target`);
            goal = `on_pkg target p${x}_${y}`;
        }
        else if (intention == 'go_to') {
            goal = `on me p${x}_${y}`;
        }
    }
    else { //coop case
        myBeliefset.declare(`on partner p${Math.round(partner.x)}_${Math.round(partner.y)}`);
        myBeliefset.declare(`different partner me`);
        myBeliefset.declare(`different me partner`);
        if (intention == 'go_deliver') {
            myBeliefset.declare(`holding partner target`);
            goal = `on_pkg target p${x}_${y}`;
        }
        else {
            print_error("[plan] coop mode with unknown intention");
            throw ['unsupported intention (coop mode)'];
        }
    }
    //check and correct the variables string (becaouse I have to declare the types of the variables correctly)
    let objectsStr = myBeliefset.objects.join(' ');
    objectsStr = objectsStr.replace(' me', '');
    objectsStr = objectsStr + ' - position';
    let targetIndex = objectsStr.indexOf('target');
    if (targetIndex !== -1) {
        objectsStr = objectsStr.replace(' target', '');
        objectsStr = objectsStr + ' target - package';
    }
    if (coop) {
        objectsStr = objectsStr.replace(' partner', '');
        objectsStr = objectsStr + ' me partner - agent';
    }
    else {
        objectsStr = objectsStr + ' me - agent';
    }
    //create PDDL problem
    let pddlProblem = new PddlProblem(
        'bitdelivery-prob',
        objectsStr,
        myBeliefset.toPddlString(),
        goal
    )
    //save the problem to file
    if (save_pddl) pddlProblem.saveToFile();
    let problem = pddlProblem.toPddlString();

    let plan;
    if (!coop) {//single case -> use single case domain
        plan = await onlineSolver(domain, problem);
    }
    else {//coop case -> use coop case domain
        plan = await onlineSolver(domain_coop, problem);
    }
    return plan;
}

//function to move in one direction by one tile
async function move(to) {
    //convert the position from PDDL format
    const regex = /P(\d+)_(\d+)/;
    const match = to.match(regex);
    if (match) {
      var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
    }
    else {
      print_error(`Invalid position format: ${position}`);
    }
    let counter = 0;
    while (global.me.x != x || global.me.y != y) { //parsing direction
        let last_action = null
        let me_tmp = { x: global.me.x, y: global.me.y };
        if (x < global.me.x) {
            last_action = "left";
            await client.move('left');
        }
        else if (x > global.me.x) {
            last_action = "right";
            await client.move('right');
        }
        else if (y > global.me.y) {
            last_action = "up";
            await client.move('up');
        }
        else if (y < global.me.y) {
            last_action = "down";
            await client.move('down');
        }
        if ((global.me.x == me_tmp.x) && (me.y == me_tmp.y) && (counter < 3)) { //retrying a bit if failed
            if (logs) console.log(colors.green + "[plan] " + resetColor + "-> retrying");
                counter++;
            continue;
        }
        else if (counter == 3) { //stucked throw error
            if (logs) console.log(colors.green + "[plan] " + resetColor + "-> execute STUCKED");
            throw [colors.green + "[plan]" + resetColor + 'stucked'];
        }
        else { //if I did the move set my position correctly (my actial position could not be an integer)
            global.me.x = x;
            global.me.y = y;
        }
        if (logs) console.log(colors.green + "[plan] " + resetColor + "moving " + last_action + " to (" + x + ", " + y + ")");
    }
}

//for random move plan
function getRandomDirection() {
    const directions = ["up", "down", "left", "right"];
    const randomIndex = Math.floor(Math.random() * directions.length);
    return directions[randomIndex];
}

// used to avoid that node microcode doesn't let the events activate for the messages
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

//to instantly remove parcel after delivery (without waiting a parcel sensing event)
function delete_put_down() {
    const idsToDelete = [];
    for (const p of beliefSet_parcels.values()) {
        if (p.carriedBy == global.me.id) {
            idsToDelete.push(p.id);
        }
    }
    for (const id of idsToDelete) {
        beliefSet_parcels.delete(id);
    }
}


//###################################################################################################
//(9) program launch
//###################################################################################################

//launch the main loop
const myAgent = new IntentionRevisionReplace();
myAgent.loop();
