import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder_2.mjs';
import { onlineSolver, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";

import fs from 'fs';
const path = './tmp';

const logs = true;
const communication_logs = true;
const kill = true;
const message_delay = 200
const preferable_tile_dimension = 4
const minimum_time_to_delete_belief = 7000
const option_generation_delay = 100
const killing_time_for_next_step_of_plan = 2000
const refresh_time_for_plan = 200


const save_pddl = true; //in ./tmp

if (save_pddl) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}


//colors for the logs
const colors = {                        //planner POST (white)
    yellow: '\x1b[33m',                 //events (not comms)
    blue: '\x1b[34m',                   //option generator
    red: '\x1b[31m',                    //main loop
    green: '\x1b[32m',                  //planner
    pink: '\x1b[35m',                   //intentions
    bgmagenta: "\x1b[45m",              //normal communications
    bgcyan: "\x1b[46m"                  //planner communications
    //yellowAndWhite: '\x1b[33;47m'
};
const resetColor = '\x1b[0m';

function print_error(error) {
    console.log("\n\n" + "⚠️⚠️⚠️ " + colors.red + "[ERROR]" + "\n\t" + error + "\n\n" + resetColor);
}


var plan_following_status = { active: false, last_message_received: 0 }


//object that represent partner status 
var partner = 0;
global.communication = { partner_id: null, master: false }

let token = ""
let name = ""
if (process.argv[2] !== undefined) name = "?name=" + process.argv[2]
if (process.argv[3] !== undefined) token = process.argv[3]

const client = new DeliverooApi(
    'http://localhost:8080/' + name,
    token
)

//---------------------------------------------------------------------------------------------------
//communications

global.me = {};
client.onYou(({ id, name, x, y, score }) => {
    if (logs) console.log(colors.yellow + "[onYou] " + resetColor + "receiving new position: (" + x + " - " + y + ")");
    global.me.id = id;
    global.me.name = name;
    global.me.x = x;
    global.me.y = y;
    global.me.score = score;
})


//broadcast to let the other agent know that there is a connection available
const partner_interval = setInterval(
    function () {
        client.shout('🍗🍗🍗');
        console.log(colors.bgmagenta, "searching partner", resetColor)
    }, 500);


// Defining the Master/Slave relationship based on the biggest string, bigger id is the master
function set_role(id) {
    if (global.me.id > id) {
        global.communication.master = true
        if (communication_logs) console.log(colors.bgmagenta, "I'm the Master", resetColor);
        clearInterval(partner_interval)
    } else {
        global.communication.master = false
        if (communication_logs) console.log(colors.bgmagenta, "I'm the Slave", resetColor);
        clearInterval(partner_interval)
    }
    global.communication.partner_id = id;
}



client.onMsg(async (id, name, msg, reply) => {
    //teammate searching the partner (is allowed to reset the role in case the teammate crashed)
    if (msg == "🍗🍗🍗") {
        if (communication_logs) console.log(colors.bgmagenta, "[handshake]", resetColor, " request received");
        let reply = await client.ask(id, '🐔🐔🐔');
        if (reply == "🐔🐔🐔") set_role(id)
        // The teammate handshake 
    } else if (msg == "🐔🐔🐔" && !global.communication.partner_id) {
        if (reply) {// per protocol definition the teammate must use the ask method, so the field reply must be not null
            if (communication_logs) console.log(colors.bgmagenta, "[handshake]", resetColor, "replying to request");
            try { reply("🐔🐔🐔") } catch { (error) => print_error(error) }
            set_role(id);
        }
        else print_error("the handshake didn't respect the protocol");
        //communication between partners has protocol the exchange of messages  msg.type and msg.obj
    } else if (id == global.communication.partner_id) {//if is the partner
        if (communication_logs) console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, msg.type)
        if (msg.type == "beliefset_agents") { //make the partner aware of other agents in the his blind side
            let obj = jsonToMap(msg.obj) //1!
            if (obj.size > 0) {
                if (communication_logs) console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, " before\n",
                    printBeliefAgents(beliefSet_agents), "obj:\n", printBeliefAgents(obj));
                for (const [key, a] of obj) {
                    if (beliefSet_agents.has(a.id)) {
                        //check for who has the last update on an agent
                        if (a.time > beliefSet_agents.get(a.id).time) {
                            beliefSet_agents.set(a.id, a);
                        }
                    } else beliefSet_agents.set(a.id, a);
                }
                if (communication_logs)
                    console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, " after\n ", printBeliefAgents(beliefSet_agents));
            }
        } else if (msg.type == "beliefset_parcels") {
            let obj = jsonToMap(msg.obj)
            if (communication_logs) console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, " before\n", msg.obj, "obj:\n", printBeliefParcels(obj));
            if (obj.size > 0) {
                for (const [key, a] of obj) {
                    //check for who has the last update on a parcel
                    if (beliefSet_parcels.has(a.id)) {
                        if (a.time > beliefSet_parcels.get(a.id).time) {
                            beliefSet_parcels.set(a.id, a)
                        }
                    } else beliefSet_parcels.set(a.id, a)
                }
                console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, " after ", printBeliefParcels(beliefSet_parcels));
            }
        } else if (msg.type == "option_communication") {
            //The partner communication on the most probable option that can became an intention
            if (!reply) {
                print_error("message with no reply")
                return;
            }
            let partner_options = msg.obj
            forget_parcel_id = null;
            console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, " option communication ", partner_options)
            let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
            if (current_intention) {
/*                 if (!(partner_options[0][0] == "generate_plan" || partner_options[0][0] == "follow_plan") ||
                    !(current_intention.predicate[0] == "generate_plan" || current_intention.predicate[0] == "follow_plan")) {
                    console.trace()
                    await myAgent.remove_plan() //1!
                } */
                // if me and the partner have the same intention, which will have a better reward on it
                // if i have the worst possible reward going somewhere(I'm more distant for example),
                // i have to forget that position and tell the other to go_ahead
                if (partner_options[0][0] == "go_to" && current_intention.predicate[0] == partner_options[0][0]
                    && current_intention.predicate[2] == partner_options[0][2] && current_intention.predicate[3] == partner_options[0][3]) {
                    forget_position = { coordinates: [partner_options[0][2], partner_options[0][3]], time: Date.now() } //1!
                    //TODO: implementare discriminazione
                    if (partner_options[0][1] > current_intention.predicate[1])
                    reply({ type: "go_ahead" }) //in un IF
                    // if there is a packet to pick up, if i'm nearer(major reward) that i will go to pick it up and the other one must forget
                } else if (partner_options[0][0] == "go_pick_up") {
                    if (current_intention.predicate[0] == partner_options[0][0] && current_intention.predicate[2] == partner_options[0][2] &&
                        current_intention.predicate[3] == partner_options[0][3]) {
                        if (partner_options[0][1] > current_intention.predicate[1]
                            || (partner_options[0][1] == current_intention.predicate[1] && (!global.communication.master))) {
                            reply({ type: "go_ahead" })
                            current_intention.stop() //1!
                            forget_parcel_id = partner_options[0][4]
                            option_generation(4)
                        } else { // I have the higher priority
                            if (partner_options[1]) {
                                reply({ type: "go_with_second" })
                            }
                            else {
                                reply({ type: "generate_another" })
                            }
                        }
                    } else {
                        reply({ type: "go_ahead" })
                    }
                } else {
                    reply({ type: "go_ahead" })
                }
            } else reply({ type: "go_ahead" })

        } else if (msg.type == "you_block_me") {
            // sent by partner to tell me that i'm blocking his action
            console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, "I'm Blocking: partner asks for help")
            let partner_options = msg.obj.options
            let partner_status = msg.obj.status
            // if i can do something else, than i will go forward for my way and ignore the partner
            let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)

            if (current_intention != undefined && (current_intention.predicate[0] == "go_deliver" || current_intention.predicate[0] == "go_pick_up") &&
                current_intention.predicate[1] - partner_options[0][1] > 2) {
                console.log(colors.bgmagenta, "[Reply]", resetColor, "I_ignore_you")
                reply({ type: "i_ignore_you" })
            } else {
                // if i cannot do anything let's start a plan that works for both
                let intentions = [...myAgent.intention_queue.values()] //1! just 1
                // if there isn't another plan related intention, lets' promote the option in an intention
                if (!intentions.some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))
                    await myAgent.push(["generate_plan", 9999, partner_options[0], partner_status])
                // preparing for the plan execution
                reply_for_plan = { time: 0, status: "not_received" }
                reply({ type: "plan" })
                console.log(colors.bgmagenta, "[Reply]", resetColor, "Responding with: preparing plan")
            }
        } else if (msg.type == "release_me") {
            // the plan uses the await ask as a syncronization mechanism, so in case of any error the partner can ask me to reply to an ask
            try { reply_for_plan.reply({ msg: "stop" }); ;console.trace();
            if(kill) process.exit() } catch (error) { print_error(error) }
        } else if (msg.type == "following") {
            let intentions = [...myAgent.intention_queue.values()]
            // the plan uses the await ask as a syncronization mechanism,
            if (intentions.some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))
                reply_for_plan = { time: Date.now(), reply: reply, msg: msg, status: "received" }
            else reply({ msg: "stop" })
        } else { print_error("TEAMMATE SENT A NON SUPPORTED MESSAGE TYPE: " + msg) }
    } else {//non partner messages
        if (communication_logs)
            console.log(colors.bgmagenta, "[Message]", resetColor, " received:", id, name, msg, reply)
    }
});


var reply_for_plan = null

var last_message_sent = 0;
// to avoid too many messages there is a timer in the 
function message_timer() {
    if (Date.now() - last_message_sent > message_delay) {
        last_message_sent = Date.now();
        return true
    } else return false
}

function say_to_teammate(msg_type, obj) {
    let message = "";
    if (obj instanceof Map)
        message = mapToJSON(obj)
    else message = obj
    if (communication_logs)
        console.log(colors.bgmagenta, "[Saying to Partner]", resetColor, msg_type, message)
    client.say(global.communication.partner_id, { type: msg_type, obj: message })
}

async function ask_teammate(msg_type, obj) {
    //if (communication_logs) console.log("Sending:", { type: msg_type, obj:obj })
    let message = "";
    if (obj instanceof Map)
        message = mapToJSON(obj)
    else message = obj
    if (communication_logs)
        console.log(colors.bgmagenta, "[Asking To Partner]", resetColor, msg_type, message)
    var reply = await client.ask(global.communication.partner_id, { type: msg_type, obj: message })
    if (communication_logs)
        console.log(colors.bgmagenta, "[Partner responded]", resetColor, reply, "to", msg_type)
    return reply
}

//---------------------------------------------------------------------------------------------------
//support functions

// function to determine where are some preferable position to be, given the spawnable tiles
function generate_favorite_coordinates() {
    const temporaryGridMap = Array.from({ length: map.width }, () => Array(map.height).fill(0));
    let maxValue = -1;
    for (let tile of map.spawnable_tiles) {
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
        if (value > maxValue / 2) { //to reduce the list a bit
            resultList.push({ x, y, value, time: start });
        }
    }
    resultList.sort((a, b) => b.value - a.value);
    return resultList;
}


function distance_manhattan(a, b) {
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(b.y))
    return dx + dy;
}


// use an a* pathfinder to determine the effective distance between points
function distance_path(start_pos, end_pos, consider_partner) {
    if (!grid) {
        return null;
    }
    let grid_copy = grid.map(row => [...row]);
    for (let agent of beliefSet_agents.values()) {
        if (agent != undefined) {
            try {
                if (global.me.id != agent.id && (consider_partner || agent.id != global.communication.partner_id))
                    //mark obstacles on the grid
                    grid_copy[Math.round(agent.x)][Math.round(agent.y)] = 1;
            } catch (error) { console.log(printBeliefAgents, error) }
        }
    }

    let start = new Node(Math.round(start_pos.x), Math.round(start_pos.y), 0, 0);
    let end = new Node(Math.round(end_pos.x), Math.round(end_pos.y), 0, 0);
    let path = Pathfinder.aStar(grid_copy, start, end);

    if (path == null)
        return null;
    else return path.length;
}



//compute the shortest path to a delivery point
function get_nearest_delivery_point_path(a, consider_partner) {
    let min = Number.MAX_VALUE;
    let nearest_point = null;
    let distance = null;
    for (let delivery_point of map.delivery_tiles) {
        distance = distance_path(a, delivery_point, consider_partner);
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

function mapToJSON(map) {
    const obj = Object.fromEntries(map);
    return JSON.stringify(obj);
}

function jsonToMap(jsonString) {
    const obj = JSON.parse(jsonString);
    return new Map(Object.entries(obj));
}

function printBeliefAgents(beliefset) {
    Array.from(beliefset.values()).map(({ id, x, y, name, reward, time, carriedBy }) => {
        return `${id}:${name},${x},${y},${reward},${time},${carriedBy}\n`
    }).join(' ');
}


function printBeliefParcels(beliefset) {
    Array.from(beliefset.values()).map(({ id, x, y, reward, time, viewable, carriedBy }) => {
        return `${id}:${x},${y},${reward},${time},${viewable},${carriedBy}\n`
    }).join(' ');
}


//to avoid ghost parcels
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

//init PDDL assumptions
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

function init_domains() {
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


    let pddlDomain = new PddlDomain('bitdelivery-world');
    pddlDomain.addAction(move);
    pddlDomain.addAction(grab);
    pddlDomain.addAction(drop);
    pddlDomain.predicates = [];
    pddlDomain.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain.addPredicate("on ?x - agent ?pos - position");
    pddlDomain.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain.addPredicate("near ?pos1 ?pos2 - position");
    if (save_pddl) {
        pddlDomain.saveToFile();
    }
    domain = pddlDomain.toPddlString();

    let pddlDomain_coop = new PddlDomain('bitdelivery-world_coop');
    pddlDomain_coop.addAction(move_coop);
    pddlDomain_coop.addAction(grab);
    pddlDomain_coop.addAction(drop);
    pddlDomain_coop.predicates = [];
    pddlDomain_coop.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain_coop.addPredicate("on ?x - agent ?pos - position");
    pddlDomain_coop.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain_coop.addPredicate("near ?pos1 ?pos2 - position");
    pddlDomain_coop.addPredicate("different ?ag1 ?ag2 - agent");
    if (save_pddl) {
        pddlDomain_coop.saveToFile();
    }
    domain_coop = pddlDomain_coop.toPddlString();
}

//---------------------------------------------------------------------------------------------------
//main program begin


//main variables
let beliefSet_agents = new Map();
let beliefSet_parcels = new Map();
const start = Date.now();

//---------------------------------------------------------------------------------------------------
//events menagment

//config event
let decay_time;
const config = {};

client.onConfig((config_input) => {
    if (logs) console.log(colors.yellow + "[onConfig] " + resetColor + "receiving parameters", config_input);
    config.AGENTS_OBSERVATION_DISTANCE = config_input.AGENTS_OBSERVATION_DISTANCE;
    config.PARCELS_OBSERVATION_DISTANCE = config_input.PARCELS_OBSERVATION_DISTANCE;
    config.PARCEL_DECADING_INTERVAL = config_input.PARCEL_DECADING_INTERVAL;
    config.MOVEMENT_DURATION = config_input.MOVEMENT_DURATION
    if (config.PARCEL_DECADING_INTERVAL == "infinite") decay_time = 0;
    else decay_time = parseInt(config.PARCEL_DECADING_INTERVAL.match(/\d+(\.\d+)?/)[0]) * 1000;
})

//create and initialize domains for planning
let domain;
let domain_coop;
init_domains();

//support variables for planning
const myMapBeliefset = [];              //for map PDDL instances
let grid = {};                          //binary grid for traking map situation

//map event
const map = {};
let agent_delete_time = 0;

client.onMap((width, height, tiles) => {
    if (logs) console.log(colors.yellow + "[onMap] " + resetColor + " receiving map");
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
    if (agent_delete_time < minimum_time_to_delete_belief) agent_delete_time = minimum_time_to_delete_belief;
    map.favorite_coordinates = generate_favorite_coordinates();
    //if(logs) console.log(colors.yellow + "[onMap]" +resetColor+ map.favorite_coordinates);
    init_myMapBeliefset();
})


//agents event 
client.onAgentsSensing((agents) => {
    if (logs) console.log(colors.yellow + "[onAgents] " + resetColor + "agent_sensing");
    let time = Date.now();
    for (let a of agents) {       //update info
        a.time = time;
        beliefSet_agents.set(a.id, a);
    }
    const idsToDelete = [];     //remove obsolete info
    for (const a of beliefSet_agents.values()) {
        //viewable
        if (!agents.some(agent => agent.id === a.id)) {
            if (distance_manhattan(global.me, a) <= config.AGENTS_OBSERVATION_DISTANCE || Date.now() - a.time > agent_delete_time) {
                if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "delete agent memory (lost track):", a);
                idsToDelete.push(a.id);
            }
        }
    }
    for (const id of idsToDelete) {
        beliefSet_agents.delete(id);
    }
    if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "memory agents:\n" + printBeliefAgents(beliefSet_agents));
    option_generation(1);
})


//parcels event
client.onParcelsSensing(parcels => {
    if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "parcels_sensing");
    let time = Date.now();

    for (let p of parcels) {     //update info
        p.time = time;
        beliefSet_parcels.set(p.id, p);
    }
    const idsToDelete = [];     //remove obsolete info
    for (const p of beliefSet_parcels.values()) {
        if (p.reward < 2) {
            if (logs) console.log(colors.yellow + "[onParcels]" + resetColor + "delete parcel memory (expired nearby):", p);
            idsToDelete.push(p.id);
        }
        else if ((p.carriedBy) && (p.carriedBy !== global.me.id)) {
            if (logs) console.log(colors.yellow + "[onParcels]" + resetColor + "delete parcel memory (carried):", p);
            idsToDelete.push(p.id);
        }
        else if (!parcels.some(parcel => parcel.id === p.id)) {
            if (distance_manhattan(global.me, p) <= config.PARCELS_OBSERVATION_DISTANCE) {
                if (logs) console.log(colors.yellow + "[onParcels]" + resetColor + "delete parcel memory (lost track):", p);
                idsToDelete.push(p.id);
            }
            else if (Date.now() - p.time > decay_time) {
                p.reward -= Math.floor((Date.now() - p.time) / decay_time);
                if (p.reward > 2) {
                    p.time = Date.now();
                    beliefSet_parcels.set(p.id, p);
                }
                else {
                    if (logs) console.log(colors.yellow + "[onParcels]" + resetColor + "delete parcel memory (expired somewhere):", p);
                    idsToDelete.push(p.id);
                }
            }
        }
    }
    for (const id of idsToDelete) {
        beliefSet_parcels.delete(id);
    }
    let printBelief = Array.from(beliefSet_parcels.values()).map(({ id, x, y, reward, time, carriedBy }) => {
        return `\t${id}:${x},${y},${reward},${time},${carriedBy}\n`;
    }).join(' ');
    if (logs) console.log(colors.yellow + "[onParcels] " + resetColor + "parcel_memory:\n" + printBelief);
    option_generation(2);
})


//---------------------------------------------------------------------------------------------------
//option generator
var last_options = null;
var forget_position = null
let last_option_generated = 0
const tiles_timeout = 4000;     //to not return to the same position to early
const norm_cost = 4;            //normalization costant -> tradeoff between decay_time & movement_time
const risk = 3;                 //(1...10) risk to not going directly to the biggest parcel


async function option_generation(caller_method_id) {
    // to keep the 
    if (Date.now() - last_option_generated > option_generation_delay) {
        last_option_generated = Date.now();
        //if the caller is the main loop, to avoid error, make it loop
    } else if (caller_method_id == 3) while (Date.now() - last_option_generated > option_generation_delay) { }
    else return


    if (logs) {
        if (caller_method_id == 1) {
            console.log(colors.blue + "[opt_gen]" + resetColor + "agents call");
        }
        else if (caller_method_id == 2) {
            console.log(colors.blue + "[opt_gen]" + resetColor + "parcels call");
        }
        else if (caller_method_id == 3) {
            console.log(colors.blue + "[opt_gen]" + resetColor + "main loop call");
        } else if (caller_method_id == 4) {
            console.log(colors.blue + "[opt_gen]" + resetColor + "message handler call");
        }
    }


    let options = options_by_parcels();
    if (options.length == 0) {
        //tryng to generate options without considering the partner as an obstacle
        let options_2 = options_by_parcels(false)
        //if i can generate options only when not considering the partner as enemy, means that we block each other and can be that
        // we maybe need to call the planner

        console.log(colors.bgcyan + "Maybe blocked for: " + resetColor,
            options_2)

        if (options_2.length != 0 && options_2[0][0] != "go_pick_up" &&
            (![...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))) {
            if (global.communication.partner_id) {
                //multiple requests?????
                let reply = await ask_teammate("you_block_me", { status: global.me, options: options_2 })
                let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
                //console.log(reply.type == "plan", current_intention === undefined)
                if (reply.type == "plan" &&
                    (current_intention === undefined ||// there can be multiple calls in parallel
                        !(current_intention.predicate[0] == "follow_plan" || current_intention.predicate[0] == "generate_plan"))) {
                    await myAgent.push(["follow_plan", 9999, reply.obj])
                    console.log(colors.blue + "[opt_gen]" + resetColor + "The partner decided for a common plan");
                    return;
                }
            } else console.log(colors.blue + "[opt_gen]" + resetColor + "Is ignoring me");
        }
    }
    //find & push the best option
    let best_option;
    let max_priority = Number.MIN_SAFE_INTEGER;
    for (const option of options) {
        if (option[1] > max_priority) {
            max_priority = option[1];
            best_option = option;
        }
    }

    if (!best_option && map.favorite_coordinates) {   //no parcel detected
        if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "no option found, going for favorite coordinates");
        let time = Date.now();
        if (options.length == 0 || options[0][0] == "random_move") {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "no option");
            let option_is_generated = false;
            if (communication_logs && forget_position != null)
                console.log(colors.bgmagenta + "[Generating Positions]" + resetColor + colors.blue + forget_position.coordinates + resetColor)
            for (let position of map.favorite_coordinates) {
                //======message
                if (forget_position != null && time - forget_position.time < 500 && forget_position.coordinates[0] == position.x && forget_position.coordinates[1] == position.y)
                    continue;
                if (distance_manhattan(global.me, position) < 3) {
                    position.time = time;
                    continue;   //to close (planner calls are expensive)
                }
                if (position.time != start && time - position.time < tiles_timeout) {
                    continue;   //timeout
                }
                // using the distance path, if it returns null means that the agent cannot reach that point
                let distance = distance_path(global.me, position, true);
                if (distance) {
                    options.push(["go_to", position.value - distance - 100, position.x, position.y]); //-100-> priority go_to < all others cases (per coop)
                    option_is_generated = true
                }
            }
            //to not let the agent stuck it will be generated a random move if no other action is available
            if (!option_is_generated) {
                options.push(["random_move", -9999, 0, 0]);

            }
        }
    }
    options.sort(function (a, b) {
        return b[1] - a[1];
    });
    //==================================== confrontation with the partner
    if (options[0]) {
        // communicate the 
        if (global.communication.partner_id && (options[0][0] == "go_pick_up" || options[0][0] == "go_to")) {
            if (message_timer()) {
                let reply = await ask_teammate("option_communication", options)
                if (reply.type == "go_with_second") {
                    //use second option
                    last_options = options;
                    await myAgent.push(options[1])
                    return;
                } else if (reply.type == "generate_another") {
                    console.log(colors.bgcyan, "[Received reply]", resetColor, "changing plan")
                    if (options[0] == "go_pick_up") forget_parcel_id = options[0][4]
                    else forget_position = { coordinates: [options[0][2], options[0][3]], time: Date.now() }
                    return;
                } else if (reply.type == "go_ahead") {
                    console.log(colors.bgcyan, "[Received reply]", resetColor, "proceding with current intention")
                } else {
                    print_error("reply not supported" + reply);
                }
            }
        }
        //====================================message

        last_options = options;
        let selectedPosition = map.favorite_coordinates.find(position => position.x === options[2] && position.y === options[3]);
        if (selectedPosition) {
            selectedPosition.time = Date.now();
        }
        await myAgent.push(options[0]);
    }
    else {
        if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to generate any options");
    }
}

var forget_parcel_id = null;
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Intention revision loop
 */

class IntentionRevision {

    #intention_queue = new Array();

    get intention_queue() {
        return this.#intention_queue;
    }

    async loop() {
        let loop_counter = 0;
        while (true) {
            if (logs) console.log(colors.red + "[main_loop] " + resetColor + "==================================================================>", loop_counter++);
            // keep the partner updated 
            if (global.communication.partner_id && message_timer()) {
                say_to_teammate("beliefset_parcels", beliefSet_parcels)
                beliefSet_agents.set(global.me.id, global.me)
                say_to_teammate("beliefset_agents", beliefSet_agents)
            }
            // if stuck for some reason 
            if (plan_following_status.active && Date.now() - plan_following_status.last_message_received > killing_time_for_next_step_of_plan) {
                console.trace()
                await this.remove_plan()
            }

            let current_intention = this.intention_queue.at(this.intention_queue.length - 1)
            if (current_intention !== undefined)
                if (map.favorite_coordinates) {
                    //if i see favorite coordinates, put it as seen if is not is where i was going
                    for (let coordinates in map.favorite_coordinates) {
                        if (!(current_intention.predicate[0] == "go_to" && current_intention.predicate[2] == coordinates.x && current_intention.predicate[3] == coordinates.y))
                            if (distance_manhattan(global.me, coordinates) <= config.PARCELS_OBSERVATION_DISTANCE)
                                coordinates.time = Date.now()
                    }
                }


            if (logs) console.log(colors.red + "[main_loop]" + resetColor + "==================================================================>", loop_counter++);
            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                try {
                    if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'intentionRevision.loop', this.intention_queue.map(i => i.predicate));
                } catch (error) {
                    if (logs) console.log(error)
                }

                // Current intention
                const intention = this.intention_queue[0];

                // Start achieving intention
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'intentionRevision.loop.intention', intention);

                await intention.achieve()
                    // Catch eventual error and continue
                    .catch(error => {
                        if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'Failed intention', ...intention.predicate, 'with error:', error)
                        if (intention.predicate[0] == "generate_plan" || intention.predicate[0] =="follow_plan" )
                            console.log(intention.predicate)
                            console.trace();
                            /* if(kill)
                                process.exit() */
                    });

                // Remove from the queue
                this.intention_queue.shift();
            } else {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + "No intention found")
                option_generation(3);
            }
            // Postpone next iteration at setImmediate
            await new Promise(res => setImmediate(res));
        }
    }

    // async push ( predicate ) { }

    log(...args) {
        if (logs) console.log(...args)
    }

}

class IntentionRevisionReplace extends IntentionRevision {

    async push(predicate) {// the predicate is the same as desire or predicate

        // Check if already queued
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        // if coop planning push the intention immediately
        if (!(predicate[0] == "generate_plan" || predicate[0] == "follow_plan")) {
            if (last) {
                if (logs) console.log(colors.pink, "[Intentions]", resetColor, "---check-if-replace------>", last.predicate, "----with----", predicate);
                if (last.predicate[0] == "go_to" && predicate[0] == "go_to") {
                    return;
                }
                if ((last.predicate[0] == predicate[0]) && (last.predicate[2] == predicate[2]) && (last.predicate[3] == predicate[3])) {
                    last.predicate[1] = predicate[1];
                    return;
                }
                else if (last.predicate[1] > predicate[1]) {
                    return; // intention is already being achieved
                }
            }
            else {
                if (logs) console.log(colors.pink, "[Intentions]", resetColor, " ---> no last in the queue");
            }
        }
        if (logs) console.log(colors.pink + "[Intentions] " + resetColor + "---> IntentionRevisionReplace.push", predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);
        // if i'm changing plan release the other agent
        if (last && (last.predicate[0] == "generate_plan")) {
            try { reply_for_plan.reply("stop"); ;console.trace();
                if(kill)
                    process.exit() } catch (error) { print_error(error) }
            // Force current intention stop 
            last.stop();
        }
    }
    async remove_plan() {
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        if (last && (last.predicate[0] == "generate_plan" || last.predicate[0] == "follow_plan")) {
            if (logs) console.log(colors.pink, "[Intentions]", resetColor, " ---> delete plan execution");
            last.stop();
            if (last.predicate[0] == "generate_plan") {
                try { reply_for_plan.reply({ msg: "stop" }); ;console.trace();
                if(kill)
                    process.exit() } catch (error) { print_error(error) }
            } else if (last.predicate[0] == "follow_plan") {
                say_to_teammate("release_me", null)
            }
            this.intention_queue.shift();
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevisionReplace();
// const myAgent = new IntentionRevisionRevise();
myAgent.loop();


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Intention
 */
class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;

    // This is used to stop the intention
    #stopped = false;
    get stopped() {
        return this.#stopped;
    }
    stop() {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if (this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    #parent;

    /**
     * predicate is in the form ['go_to', x, y]
     */
    get predicate() {
        return this.#predicate;
    }
    #predicate;

    constructor(parent, predicate) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log(...args) {
        if (this.#parent && this.#parent.log)
            this.#parent.log(...args)
        else if (logs) console.log(colors.green + "[plan] " + resetColor, ...args)
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
                this.log(colors.pink + '[achive intent] ' + resetColor + 'achieving intention', ...this.predicate, 'with plan', planClass.name);
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log(colors.pink + '[achive intent] ' + resetColor + 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log(colors.pink + '[achive intent] ' + resetColor + 'failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
                }
            }
        }
        // if stopped then quit
        if (this.stopped) throw ['[achive intent] stopped intention', ...this.predicate];

        // no plans have been found to satisfy the intention
        throw ['[achive intent] no plan satisfied the intention ', ...this.predicate]
    }

}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Plan library
 */

const planLibrary = [];

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop() {
        //this.log( 'stop plan' );
        this.#stopped = true;
        for (const i of this.#sub_intentions) {
            i.stop();
        }
    }
    get stopped() {
        return this.#stopped;
    }

    /**
     * #parent refers to caller
     */
    #parent;

    constructor(parent) {
        this.#parent = parent;
    }

    log(...args) {
        if (this.#parent && this.#parent.log)
            this.#parent.log('\t', ...args)
        else
            if (logs) console.log(colors.green + "[plan] " + resetColor, ...args)
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention(predicate) {
        const sub_intention = new Intention(this, predicate);
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }
}


class Plan_single extends Plan { // Plan for the sigle agent
    static isApplicableTo(intention) {
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_deliver');
    }

    async execute(intention, priority, x, y) {

        let plan = await generate_plan(intention, x, y, 0);
        if (logs) console.log(colors.green + "[plan] " + resetColor + "executing:", intention, priority, x, y)
        if (this.stopped) throw ['stopped'];
        if (!plan || plan.length === 0) {
            if (logs) console.log(colors.green + "[plan] " + resetColor + "plan not found" + resetColor);
            throw ['failed (no single-plan found)'];
        }
        else {
            if (logs) console.log(colors.green + "[plan] " + resetColor + "plan found");
            for (let step of plan) {
                if (this.stopped) throw ['stopped'];
                let action = step.action;
                if (action == "MOVE") {
                    let [ag, from, to] = step.args;
                    if (logs) console.log(colors.green + "[plan] " + resetColor + " starting moving to", to);
                    const regex = /P(\d+)_(\d+)/;
                    const match = to.match(regex);
                    if (match) {
                        var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
                    }
                    else {
                        throw new Error(`Invalid position format: ${position}`);
                    }
                    let counter = 0;
                    while (global.me.x != x || global.me.y != y) {
                        let last_action = null
                        if (this.stopped) {
                            if (logs) console.log(colors.green + "[plan] " + resetColor + "-> execute STOPPED");
                            throw ['stopped'];
                        }
                        let me_tmp = { x: Math.round(global.me.x), y: Math.round(global.me.y) };
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
                        if ((global.me.x == me_tmp.x) && (global.me.y == me_tmp.y) && (counter < 3)) {
                            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> retrying");
                            counter++;
                            continue;
                        }
                        else if (counter == 3) {
                            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STUCKED");
                            throw [colors.green + "[plan]" + resetColor + 'stucked'];
                        }
                        else {
                            global.me.x = x;
                            global.me.y = y;
                        }
                        if (logs) console.log(colors.green + "[plan] " + resetColor + intention, "(me.pos=", x, y + ")", "(moving", last_action + ")");
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    await client.pickup();
                    if (logs) console.log(colors.green + "[plan] " + resetColor + `${ag} grab ${ob} in ${pos}`);
                } else if (action == "DROP") {
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

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


class Plan_coop extends Plan {

    static isApplicableTo(intention) {
        return (intention == 'generate_plan');
    }
    async execute(intention, priority, partner_option, partner_status) {
        if (logs) console.log(colors.bgcyan, "Starting generating", resetColor, reply_for_plan)

        partner = { x: Math.round(partner_status.x), y: Math.round(partner_status.y), id: partner_status.id }
        let plan = await generate_plan(partner_option[0], partner_option[2], partner_option[3], true);

        if (this.stopped) throw ['stopped'];
        //
        if (!plan || plan.length === 0) {
            if (logs) console.log(colors.bgcyan + "[Generate Plan]" + resetColor + "plan not found" + resetColor);
            while (reply_for_plan.reply == null) { //wait the partner to follow the orders
                if (Date.now() - last_reply.time > killing_time_for_next_step_of_plan) throw ['failed: no plan found and no reply obtained'];
                await sleep(500)
            }
            try { reply_for_plan.reply("stop"); ;console.trace();
                if(kill)
                    process.exit() } catch (error) { print_error(error) }
            throw ['failed: no coop-plan found'];
        }
        else {
            let last_reply_time
            let reply = null;
            for (let step of plan) {
                last_reply_time = Date.now()
                //active loop for waiting the partner
                while (reply_for_plan.reply == null) {
                    console.log(colors.bgcyan, "[Generate_plan]", resetColor, reply_for_plan, last_reply_time)
                    if (reply_for_plan.msg == "stop") {
                        throw ["stopped by partner"]
                    }
                    if (Date.now() - last_reply_time.time > killing_time_for_next_step_of_plan)
                        throw ['failed: no reply obtained'];
                    // to avoid that node microcode doesn't let the events activate for the messages
                    await sleep(refresh_time_for_plan)
                    if (this.stopped) throw ["stopped by partner"]
                }
                if (logs) console.log(colors.bgcyan + "[Generate Plan]" + resetColor + " received reply")

                reply = reply_for_plan.reply
                let action = step.action;
                if (action == "MOVE_COOP") {
                    let [ag, ag2, from, to] = step.args;
                    if (ag == "PARTNER") {
                        // use the reply object to communicate since the partner is
                        //waiting for it
                        reply({ obj: step, msg: "go" })
                        reply_for_plan.reply = null
                    }
                    else {
                        reply({ msg: "stay_put" })
                        reply_for_plan.reply = null

                        if (logs) console.log(colors.bgcyan + "[plan]" + resetColor + " starting moving to", to);
                        try { await move(to) }
                        catch (error) {
                            while (reply_for_plan.reply == null) {
                                console.log(colors.bgcyan, "[Generate Plan]", resetColor, reply_for_plan, last_reply_time)
                                if (reply_for_plan.msg.msg == "stop") {
                                    throw ["stopped by partner"]
                                }
                                if (Date.now() - last_reply_time.time > killing_time_for_next_step_of_plan)
                                    throw ['failed: no reply obtained'];
                                // to avoid that node microcode doesn't let the events activate for the messages
                                await sleep(refresh_time_for_plan)
                            }
                            reply_for_plan.reply({ msg: "stop" })
                            ;console.trace();
                            if(kill)
                                process.exit()
                            throw [error]
                        }
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    if (ag == "PARTNER") {
                        reply({ obj: step, msg: "go" })
                        reply_for_plan.reply = null
                    }
                    else {
                        await client.pickup();

                        if (logs) console.log(colors.bgcyan + "[Generate Plan]" + resetColor + `${ag} grab ${ob} in ${pos}`);
                    }


                } else if (action == "DROP") {
                    let [ag, ob, pos] = step.args;
                    if (ag == "PARTNER") {
                        reply({ obj: step, msg: "go" })
                        reply_for_plan.reply = null
                    }
                    else {
                        await client.putdown();
                        delete_put_down();
                        if (logs) console.log(colors.bgcyan + "[Generate Plan]" + resetColor + `${ag} drop ${ob} in ${pos}`);
                    }
                }
            }
            reply_for_plan.reply({ msg: "stop" })
            return "success";
        }
    }
}

class Plan_receiver extends Plan {
    static isApplicableTo(intention) {
        return (intention == 'follow_plan');
    }

    async execute(intention, priority) {
        console.log(colors.bgcyan, "Starting receiving plan", resetColor)
        plan_following_status.last_message_received = Date.now()
        plan_following_status.active = true

        while (plan_following_status.active) {
            let reply = await client.ask(global.communication.partner_id, { type: "following", msg: "i'm here" })
            plan_following_status.last_message_received = Date.now()

            console.log(colors.bgcyan, "[Follow Plan] ", resetColor, "My step is:", reply)
            if (reply.msg == "stop") {
                plan_following_status.active = false
                return "success"
            }
            if (reply.msg == "stay_put") continue
            let step = reply.obj
            let action = step.action;
            if (action == "MOVE_COOP") {
                let [ag, ag2, from, to] = step.args;
                try { await move(to) }
                catch (error) {
                    client.say(global.communication.partner_id, { type: "following", msg: "stop" })
                    ;console.trace();
                    if(kill)
                        process.exit()
                    throw [error]
                }
            } else if (action == "GRAB") {
                let [ag, ob, pos] = step.args;
                await client.pickup();
                //updateParcelsBelief([]);

                if (logs) console.log(colors.bgcyan + "[Follow Plan]" + resetColor + `${ag} grab ${ob} in ${pos}`);
            } else if (action == "DROP") {
                let [ag, ob, pos] = step.args;
                await client.putdown();
                delete_put_down();
                //updateParcelsBelief([]);

                if (logs) console.log(colors.bgcyan + "[Follow Plan]" + resetColor + `${ag} drop ${ob} in ${pos}`);
            }
        }
        return "success";
    }
}

class RandomMove extends Plan {

    static isApplicableTo(intention) {
        return intention == 'random_move';
    }

    async execute(desire, priority, x, y) {
        const direction = getRandomDirection();
        console.log(colors.green + "[plan]" + resetColor + "move randomly", direction);
        await client.move(direction);
        return "success"
    }
}
function getRandomDirection() {
    const directions = ["up", "down", "left", "right"];
    const randomIndex = Math.floor(Math.random() * directions.length);
    return directions[randomIndex];
}


// plan classes are added to plan library 
planLibrary.push(Plan_single);
planLibrary.push(Plan_coop);
planLibrary.push(Plan_receiver);
planLibrary.push(RandomMove);



async function generate_plan(intention, x, y, coop) {
    const myBeliefset = new Beliefset();
    for (let ob of myMapBeliefset) {
        myBeliefset.declare(ob);
    }
    let goal = '';
    for (const agent_obj of beliefSet_agents) {
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
    myBeliefset.declare(`on me p${Math.round(global.me.x)}_${Math.round(global.me.y)}`);
    if (!coop) {
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
    else {
        myBeliefset.declare(`on partner p${Math.round(partner.x)}_${Math.round(partner.y)}`);
        myBeliefset.declare(`different partner me`);
        myBeliefset.declare(`different me partner`);
        if (intention == 'go_deliver') {
            myBeliefset.declare(`holding partner target`);
            goal = `on_pkg target p${x}_${y}`;
        }
        else {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "coop mode with unknown intention");
            throw ['unsupported intention (coop mode)'];
        }
    }
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
    let pddlProblem = new PddlProblem(
        'bitdelivery-prob',
        objectsStr,
        myBeliefset.toPddlString(),
        goal
    )
    if (save_pddl) pddlProblem.saveToFile();
    let problem = pddlProblem.toPddlString();

    let plan;
    if (!coop) {
        plan = await onlineSolver(domain, problem);
    }
    else {
        plan = await onlineSolver(domain_coop, problem);
    }
    return plan;
}



function options_by_parcels(consider_partner = true) {
    const options = [];
    let parcels_on_me_counter = 0;
    let parcels_on_me_reward = 0;
    for (const parcel of beliefSet_parcels.values()) {   //process all parcels I'm carrying
        if (parcel.carriedBy == global.me.id) {
            parcels_on_me_reward += parcel.reward;
            parcels_on_me_counter += 1;
        }
    }
    if (parcels_on_me_counter) { //compute option "go_deliver"
        let delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
        if (!delivery_point) {
            if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find path to delivery from here ", global.me);
        }
        else {
            let priority;
            if (decay_time) {
                priority = parcels_on_me_reward - (parcels_on_me_counter * delivery_point.distance) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
            }
            else {
                priority = parcels_on_me_reward;
            }
            options.push(['go_deliver', priority, delivery_point.x, delivery_point.y]);
            //console.log("pushing go_deliver", delivery_point.x, delivery_point.y, "with priority:", priority ,"->", parcels_on_me_reward, "-", parcels_on_me_counter, delivery_point.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)
        }
    }

    for (const parcel of beliefSet_parcels.values()) {
        if (parcel.carriedBy == global.me.id || parcel.id == forget_parcel_id || parcel.carriedBy == global.communication.partner_id) {          //We carry the parcel
            continue;
        }
        else if (!parcel.carriedBy) {             //free parcel
            let distance_parcel = distance_path(global.me, parcel, consider_partner);    //and is reachable
            if (!distance_parcel) {
                if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find path to", parcel);
                continue;
            }
            let delivery_point_from_parcel = get_nearest_delivery_point_path(parcel, consider_partner); //and is deliverable + there is a decay time
            if (!delivery_point_from_parcel && decay_time) {
                if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "unable to find nearest delivery point to", parcel);
                continue;
            }
            let base_priority;
            if (decay_time) {     //compute priority & push option "go_pick_up"
                base_priority = parcel.reward + parcels_on_me_reward - (parcels_on_me_counter + 1) * (distance_parcel + delivery_point_from_parcel.distance) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
            }
            else {
                base_priority = parcel.reward + parcels_on_me_reward;
            }
            options.push(['go_pick_up', base_priority, parcel.x, parcel.y]);
            //console.log("pushing go_pick_up", parcel.x, parcel.y, "with priority:", priority ,"->", parcel.reward , parcels_on_me_reward, "-", parcels_on_me_counter+1, distance_percel,"+",delivery_point_from_parcel.distance,
            //    decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)

            //compute 2 package option
            for (const parcel2 of beliefSet_parcels.values()) {
                if (parcel2.carriedBy || parcel2 === parcel || parcel2.id == forget_parcel_id) {
                    continue;
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
                options.push(['go_pick_up', base_priority + deviation_priority, parcel2.x, parcel2.y]);
            }


            if (parcels_on_me_counter) {    //second option (go deliver first)
                let delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
                if (!delivery_point) {
                    continue;
                }
                base_priority = parcel.reward + parcels_on_me_reward - ((parcels_on_me_counter + 1) * delivery_point.distance + delivery_point_from_parcel.distance * 2) * (decay_time / 1000) / (config.MOVEMENT_DURATION / norm_cost);
                options.push(['go_deliver', base_priority, delivery_point.x, delivery_point.y]);
                //console.log("pushing go_deliver", delivery_point_from_parcel.x, delivery_point_from_parcel.y, "with priority:", priority ,"->", parcel.reward , parcels_on_me_reward,
                //   "-", parcels_on_me_counter+1, delivery_point.distance,"+",delivery_point_from_parcel.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)
                //compute 2 package option
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
                    options.push(['go_pick_up', base_priority + deviation_priority, parcel2.x, parcel2.y]);
                }
            }
        }
        else {
            if (logs) console.log(colors.blue + "[opt_gen] " + resetColor + "something unexpected happend while generating options");
        }
    }
    return options
}

async function move(to) {
    const regex = /P(\d+)_(\d+)/;
    const match = to.match(regex);
    if (match) {
        var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
    }
    else {
        throw new Error(`Invalid position format: ${position}`);
    }
    let counter = 0;
    while (global.me.x != x || global.me.y != y) {
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
        if ((global.me.x == me_tmp.x) && (me.y == me_tmp.y) && (counter < 3)) {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> retrying");
            counter++;
            continue;
        }
        else if (counter == 3) {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STUCKED");
            throw [colors.green + "[plan]" + resetColor + 'stucked'];
        }
        else {
            global.me.x = x;
            global.me.y = y;
        }
        if (logs) console.log(colors.green + "[plan]" + resetColor, x, y, last_action);
    }
}