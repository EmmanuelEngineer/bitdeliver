import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder_2.mjs';
import { Utilities as ut } from "./Utilities.js"
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";

const logs = true;
const save_pddl = false; //in ./tmp
const communication_logs = true;

const message_delay = 200
const preferable_tile_dimension = 3        "editor.defaultFormatter": "vscode.typescript-language-features"

const minimum_time_to_delete_belief = 7000
const option_generation_delay = 100
const killing_time_for_next_step_of_plan = 2000
const refresh_time_for_plan = 200





const colors = {
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    bgmagenta: "\x1b[45m",
    bgcyan: "\x1b[46m"
    //yellowAndWhite: '\x1b[33;47m'
};
const resetColor = '\x1b[0m';


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

global.me = {};
client.onYou(({ id, name, x, y, score }) => {
    //if(logs) console.log(colors.yellow + "[onYou]" +resetColor+ "receiving new position");
    global.me.id = id;
    global.me.name = name;
    global.me.x = x;
    global.me.y = y;
    global.me.score = score;
})

//====================================================================================message


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
        console.log(colors.bgmagenta, "I'm the Master", resetColor)
        clearInterval(partner_interval)
    } else {
        global.communication.master = false
        console.log(colors.bgmagenta, "I'm the Slave", resetColor)
        clearInterval(partner_interval)
    }

    global.communication.partner_id = id
}



client.onMsg(async (id, name, msg, reply) => {
    //teammate searching the partner (is allowed to reset the role in case the teammate crashed)
    if (msg == "🍗🍗🍗") {
        if (communication_logs)
            console.log("asking handshake");
        let reply = await client.ask(id, '🐔🐔🐔');
        if (reply == "🐔🐔🐔") set_role(id)
        return;
    } else
        // The teammate handshake 
        if (msg == "🐔🐔🐔" && !global.communication.partner_id) {
            if (reply) {// per protocol definition the teammate must use the ask method, so the field reply must be not null
                if (communication_logs)
                    console.log("replying to handshake")
                try { reply("🐔🐔🐔") } catch { (error) => console.error(error) }
                set_role(id)
            }
            else console.log("⚠️⚠️⚠️" + colors.red + " the handshake didn't respect the protocol" + resetColor)
        } else
            //communication between partners has protocol the exchange of messages  msg.type and msg.obj
            if (id == global.communication.partner_id) {//if is the partner
                if (communication_logs)
                    console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, msg.type)

                if (msg.type == "beliefset_agents") {
                    //make the partner aware of other agents in the his blind side
                    let obj = ut.jsonToMap(msg.obj)
                    if (obj.size > 0) {
                        console.log(colors.bgmagenta, "[PartnerMessage] before ", resetColor, colors.blue,
                            ut.printBeliefAgents(beliefSet_agents), "obj:\n", ut.printBeliefAgents(obj))
                        for (const [key, a] of obj) {
                            a.viewable = false
                            if (beliefSet_agents.has(a.id)) {
                                //check for who has the last update on an agent
                                if (a.time > beliefSet_agents.get(a.id).time) {
                                    beliefSet_agents.set(a.id, a)
                                }
                            } else beliefSet_agents.set(a.id, a)
                        }
                        if (communication_logs)
                            console.log(colors.bgmagenta, "[PartnerMessage] after ", resetColor, colors.blue, ut.printBeliefAgents(beliefSet_agents), resetColor)
                    }
                } else if (msg.type == "beliefset_parcels") {
                    let obj = ut.jsonToMap(msg.obj)
                    console.log(colors.bgmagenta, "[PartnerMessage] before ", resetColor, colors.yellow,
                        msg.obj, "obj:\n", ut.printBeliefParcels(obj))
                    if (obj.size > 0) {
                        for (const [key, a] of obj) {
                            a.viewable = false
                            //check for who has the last update on a parcel
                            if (beliefSet_parcels.has(a.id)) {
                                if (a.time > beliefSet_parcels.get(a.id).time) {
                                    beliefSet_parcels.set(a.id, a)
                                }
                            } else beliefSet_parcels.set(a.id, a)
                        }
                        console.log(colors.bgmagenta, "[PartnerMessage] after ", resetColor, colors.yellow, ut.printBeliefParcels(beliefSet_parcels), resetColor)
                    }
                } else if (msg.type == "option_communication") {
                    //The partner communication on the most probable option that can became an intention
                    let partner_options = msg.obj
                    forget_parcel_id = null;
                    console.log(colors.bgmagenta, "[PartnerMessage] option communication ", resetColor, partner_options)
                    if (!reply) {
                        return;
                    }
                    let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
                    if (current_intention) {
                        // 
                        if (!(partner_options[0][0] == "generate_plan" || partner_options[0][0] == "follow_plan") ||
                            !(current_intention.predicate[0] == "generate_plan" || current_intention.predicate[0] == "follow_plan")) {
                            await myAgent.remove_plan()
                        }
                        // if me and the partner have the same intention, which will have a better reward on it
                        if (partner_options[0][0] == "go_pick_up" || partner_options[0][0] == "go_to") {
                            // if i have the worst possible reward going somewhere(I'm more distant for example),
                            // i have to forget that position and tell the other to go_ahead

                            if (partner_options[0][0] == "go_to" &&
                                current_intention.predicate[0] == partner_options[0][0] &&
                                (current_intention.predicate[2] == partner_options[0][2] &&
                                    current_intention.predicate[3] == partner_options[0][3])) {
                                forget_position = { coordinates: [partner_options[0][2], partner_options[0][3]], time: Date.now() }
                            } else {
                                // if there is a packet to pick up, if i'm nearer(major reward) that i will go to pick it up and the other one must forget
                                if (partner_options[0][0] == "go_pick_up" &&
                                    current_intention.predicate[0] == partner_options[0][0] &&
                                    (current_intention.predicate[2] == partner_options[0][2] &&
                                        current_intention.predicate[3] == partner_options[0][3])) {
                                    if (partner_options[0][1] >= current_intention.predicate[1] ||
                                        (partner_options[0][1] == current_intention.predicate[1] &&
                                            global.communication.partner_id > global.me.id)
                                    ) {
                                        reply({ type: "go_ahead" })
                                        current_intention.stop()
                                        forget_parcel_id = partner_options[0][4]
                                        option_generation(4)
                                    } else {
                                        reply({ type: "generate_another" })
                                    }
                                } else {
                                    reply({ type: "go_ahead" })
                                }
                            }
                        }
                        else {
                            reply({ type: "go_ahead" })
                        }
                    } else reply({ type: "go_ahead" })

                } else if (msg.type == "you_block_me") {
                    // sent by partner to tell me that i'm blocking his action
                    console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, "I'm Blocking: partner asks for help")
                    let partner_options = msg.obj.options
                    let partner_status = msg.obj.status
                    // if i can do something else, than i will go forward for my way and ignore the partner
                    if ((last_options[0][0] == "go_deliver" || last_options[0][0] == "go_pick_up") &&
                        last_options[0][1] - partner_options[0][1] > 2) {
                        console.log(colors.bgmagenta, "[Reply] option communication ", resetColor, colors.red, "I_ignore_you")
                        reply({ type: "i_ignore_you" })
                    } else {
                        // if i cannot do anything let's start a plan that works for both
                        let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
                        let intentions = [...myAgent.intention_queue.values()]
                        // if there isn't another plan related intention, lets' promote the option in an intention
                        if (!intentions.some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))
                            await myAgent.push(["generate_plan", 9999, partner_options[0], partner_status])
                        // preparing for the plan execution
                        reply_for_plan = { time: 0, status: "not_received" }
                        reply({ type: "plan" })
                        console.log(colors.bgmagenta, "[Reply] option communication ", resetColor, colors.red, "Responding with, preparin plan")


                    }
                } else if (msg.type == "release_me") {
                    // the plan uses the await ask as a syncronization mechanism, so in case of any error the partner can ask me to reply to an ask
                    try { reply_for_plan.reply({ msg: "stop" }) } catch (err) { console.log(err) }
                } else if (msg.type == "following") {
                    let intentions = [...myAgent.intention_queue.values()]
                    // the plan uses the await ask as a syncronization mechanism,
                    if (intentions.some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))
                        reply_for_plan = { time: Date.now(), reply: reply, msg: msg, status: "received" }
                    else reply({ msg: "stop" })
                } else { console.log("⚠️⚠️⚠️" + colors.red + " TEAMMATE SENT A NON SUPPORTED MESSAGE TYPE" + resetColor, msg) }
            } else//non partner messages
                if (communication_logs)
                    console.log("received:", id, name, msg, reply)
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
        message = ut.mapToJSON(obj)
    else message
    if (communication_logs)
        console.log(colors.bgmagenta, "[Saying to Partner]", resetColor, msg_type, message)
    client.say(global.communication.partner_id, { type: msg_type, obj: message })
}

async function ask_teammate(msg_type, obj) {
    //if (communication_logs) console.log("Sending:", { type: msg_type, obj:obj })

    let message = "";
    if (obj instanceof Map)
        message = ut.mapToJSON(obj)
    else message = obj
    if (communication_logs)
        console.log(colors.bgmagenta, "[Asking To Partner]", resetColor, msg_type, message)
    return await client.ask(global.communication.partner_id, { type: msg_type, obj: message })
}
//====================================================================================message
// function to determine where are some preferable position to be, given the spawnable tiles
function generate_favorite_coordinates() {
    const temporaryGridMap = Array.from({ length: map.width }, () => Array(map.height).fill(0));
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let tile of map.spawnable_tiles) {
        const { x, y } = tile;
        temporaryGridMap[x][y] += 1;
        //for each square determine the number of nearest spawnable tiles
        for (let i = x - preferable_tile_dimension; i <= x + preferable_tile_dimension; i++) {
            for (let j = y - preferable_tile_dimension; j <= y + preferable_tile_dimension; j++) {
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
        if (value > maxValue / 2) {
            resultList.push({ x, y, value, time: 0 });
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
function distance_path(a, b, consider_partner) {
    let path = pathfind(a, b, consider_partner);
    if (path == null)
        return null;
    else return path.length;
}


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


function get_nearest_delivery_point_manhattan(a) {
    let min = Number.MAX_VALUE;
    let nearest_point = null;
    let distance = null;
    for (let delivery_point of map.delivery_tiles) {
        distance = distance_manhattan(a, delivery_point);
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

function pathfind(start_pos, end_pos, consider_partner) {
    let grid = ut.generategrid(map, beliefSet_agents.values(), consider_partner)
    //console.log(start_pos,end_pos)
    //if(logs) console.log(ut.printGridSE(grid,start_pos,end_pos))
    let start = new Node(Math.round(start_pos.x), Math.round(start_pos.y), 0, 0);
    let end = new Node(Math.round(end_pos.x), Math.round(end_pos.y), 0, 0);
    let path = Pathfinder.aStar(grid, start, end);

    //if(logs) console.log("Shortest Path:", path);
    return path;
}

let beliefSet_agents = new Map();
let beliefSet_parcels = new Map();

let time = 0;
const start = Date.now();

const config = {};
//var decay_step = 1;
let decay_time;
client.onConfig((config_input) => {
    //if(logs) console.log("Config", config_input);
    config.AGENTS_OBSERVATION_DISTANCE = config_input.AGENTS_OBSERVATION_DISTANCE;
    config.PARCELS_OBSERVATION_DISTANCE = config_input.PARCELS_OBSERVATION_DISTANCE;
    config.PARCEL_DECADING_INTERVAL = config_input.PARCEL_DECADING_INTERVAL;
    config.MOVEMENT_DURATION = config_input.MOVEMENT_DURATION
    if (config.PARCEL_DECADING_INTERVAL == "infinite") decay_time = 0;
    else decay_time = parseInt(config.PARCEL_DECADING_INTERVAL.match(/\d+(\.\d+)?/)[0]) * 1000;
    //if(logs) console.log(config.MOVEMENT_DURATION);
})

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

function delete_parcels_here() {
    const idsToDelete = [];
    for (const p of beliefSet_parcels.values()) {
        if ((p.carriedBy != global.me.id) && (p.x == global.me.x) && (p.y == global.me.y)) {
            idsToDelete.push(p.id);
        }
    }
    for (const id of idsToDelete) {
        beliefSet_parcels.delete(id);
    }
}


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
        //,async ( ag1, from, to ) => console.log( 'exec move')//to_remove
    );

    const grab = new PddlAction(
        'grab',
        '?ag1 - agent ?ob - package ?pos - position',
        'and (on ?ag1 ?pos) (on_pkg ?ob ?pos)',
        'and (holding ?ag1 ?ob) (not (on_pkg ?ob ?pos))'
        //,async ( ag1, ob, pos ) => console.log( 'exec grab')//to_remove
    );

    const drop = new PddlAction(
        'drop',
        '?ag1 - agent ?ob - package ?pos - position',
        'and (on ?ag1 ?pos) (holding ?ag1 ?ob)',
        'and (not (holding ?ag1 ?ob)) (on_pkg ?ob ?pos)'
        //.async ( ag1, ob, pos ) => console.log( 'exec drop')//to_remove
    );

    const move_coop = new PddlAction(
        'move_coop',
        '?ag1 ?ag2 - agent ?from ?to - position',
        'and (on ?ag1 ?from) (near ?from ?to) (not (on ?ag2 ?to)) (different ?ag1 ?ag2)',
        'and (on ?ag1 ?to) (not (on ?ag1 ?from))'
        //,async ( ag1, ag2, from, to ) => console.log( 'exec move')//to_remove
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




let domain; //??aggiunto domains single and coop
let domain_coop;
init_domains();
const myMapBeliefset = []; //??aggiunto questo e grid +funz init emodifiche onMap
let grid = {};
const map = {};
let max_time = 0;

var delivery_grid = []//used for quick reference for when i pass on a delivery point
var favorite_position_choosing_time;
client.onMap((width, height, tiles) => {
    //if(logs) console.log(colors.yellow + "[onMap]" +resetColor+ " receiving map");
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
    //determine the time of deletion of parcels
    max_time = map.width * map.height * config.MOVEMENT_DURATION / 10;
    if (max_time < minimum_time_to_delete_belief) max_time = minimum_time_to_delete_belief;
    map.favorite_coordinates = generate_favorite_coordinates();
    if (logs) console.log("favorite coordinates", map.favorite_coordinates);
    init_myMapBeliefset();
    delivery_grid = Array.from({ length: map.height }, () => Array(map.width).fill(false))
    for (const tile of map.delivery_tiles) {
        delivery_grid[tile.x][tile.y] = true;
    }
})



var lastAgentSensingTime = Date.now();
client.onAgentsSensing((agents) => { //intanto no memoria sugli agenti
    updateAgentsBelief(agents);
})


// is made as a independent function to update the times of the last seen.
function updateAgentsBelief(agents) {
    let idsToDelete = [];

    if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "agent_sensing");
    //beliefSet_agents = new Map();
    for (let a of agents) {
        beliefSet_agents.set(a.id, a);
    }

    for (const a of beliefSet_agents.values()) {
        //viewable
        if (!agents.some(agent => agent.id === a.id)) {
            if (distance_manhattan(global.me, a) <= config.AGENTS_OBSERVATION_DISTANCE && Date.now() - a.time > max_time) {
                if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "delete agent memory (lost track):", a);
                idsToDelete.push(a.id);
            }


        }
        for (const id of idsToDelete) {
            beliefSet_agents.delete(id);
        }
    }
    if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "memory agents:\n" + ut.printBeliefAgents(beliefSet_agents));

    lastAgentSensingTime = Date.now();
    option_generation(1);

}

/**
 * Options generation and filtering function
 */
var parcel_grid = []

var lastParcelSensingTime = Date.now();
client.onParcelsSensing(parcels => {
    updateParcelsBelief(parcels);
})

// is made as a independent function to update the times of the last seen.
function updateParcelsBelief(parcels) {

    parcel_grid = Array.from({ length: map.height }, () => Array(map.width).fill(false));
    if ((parcels != undefined) && (parcels.length != 0)) {
        //if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "parcels_sensing");
        time = Date.now() - start;

        for (let p of parcels) {
            if ((!p.carriedBy) || p.carriedBy == global.me.id) {
                p.time = time;
                beliefSet_parcels.set(p.id, p);
            }
        }
        const idsToDelete = [];
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
            if (!p.carriedBy) {
                parcel_grid[p.x][p.y] = true;
            }
        }
        for (const id of idsToDelete) {
            beliefSet_parcels.delete(id);
        }
        let printBelief = Array.from(beliefSet_parcels.values()).map(({ id, x, y, reward, time, viewable, carriedBy }) => {
            return `${id}:${x},${y},${reward},${time},${viewable},${carriedBy}\n`;
        }).join(' ');
        if (logs) console.log(colors.yellow + "[onParcels]" + resetColor + "parcel_memory:\n" + printBelief);
        //
        lastParcelSensingTime = Date.now();
        option_generation(2);
    }
}


var last_options = null;

var forget_position = null
let last_option_generated = 0
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
    /**
 * Options generation
 */

    let options = options_by_parcels()

    if (options.length == 0) {
        //tryng to generate options without considering the partner as an obstacle
        let options_2 = options_by_parcels(false)
        //if i can generate options only when not considering the partner as enemy, means that we block each other and can be that
        // we maybe need to call the planner

        console.log(colors.bgcyan + "Maybe blocked for : " + resetColor,
            options_2)

        if (options_2.length != 0 && options_2[0][0] != "go_pick_up" &&
            (![...myAgent.intention_queue.values()].some(intention => (intention.predicate[0] == "follow_plan" || intention.predicate[0] == "generate_plan")))) {
            if (global.communication.partner_id) {
                {
                    let reply = await ask_teammate("you_block_me", { status: global.me, options: options_2 })
                    let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
                    console.log(reply.type == "plan", current_intention === undefined)
                    if (reply.type == "plan" &&
                        (current_intention === undefined ||// there can be multiple calls in parallel
                            !(current_intention.predicate[0] == "follow_plan" || current_intention.predicate[0] == "generate_plan"))) {
                        await myAgent.push(["follow_plan", 9999, reply.obj])
                        console.log(colors.blue + "[opt_gen]" + resetColor + "The partner decided for a common plan");
                    }
                }
            } else console.log(colors.blue + "[opt_gen]" + resetColor + "Is ignoring me");
        }
    }


    /**
     * Options filtering
     */
    if (map.favorite_coordinates) {
        if (message_timer())
            say_to_teammate("option_communication", null)
        if (options.length == 0 || options[0][0] == "random_move") {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "no option");
            let option_is_generated = false;
            if (communication_logs && forget_position != null)
                console.log(colors.bgmagenta + "[Generating Positions]" + resetColor + colors.blue + forget_position.coordinates + resetColor)
            for (let position of map.favorite_coordinates) {
                //======message
                if (forget_position != null && Date.now() - forget_position.time < 500 && forget_position.coordinates[0] == position.x && forget_position.coordinates[1] == position.y) continue;
                if (global.me.x == position.x && global.me.y == position.y) {
                    position.time = Date.now();
                    continue;
                }
                if (Date.now() - position.time > max_time) {
                    // using the distance path, if it returns null means that the agent cannot reach that point
                    let distance = distance_path(global.me, position, true);
                    if (distance) {
                        //-100 to make the go_to always the worst option
                        options.push(["go_to", position.value - distance - 100, position.x, position.y]);
                        option_is_generated = true
                    }
                }
            }
            //to not let the agent stuck it will be generated a random move if no other action is available
            if (!option_is_generated) {
                options.push(["random_move", -9999, 0, 0]);

            }
        }

        options.sort(function (a, b) {
            return b[1] - a[1];
        });
    }

    /**
     * Best option is selected
     */
    //====================================confrontation with the partner
    if (options[0]) {
        // communicate the 
        if (global.communication.partner_id && (options[0][0] == "go_pick_up" || options[0][0] == "go_deliver" || options[0][0] == "go_to")) {
            if (message_timer()) {
                let reply = await ask_teammate("option_communication", options)
                if (reply.type == "go_with_second") {
                    //use second option
                    last_options = options;
                    await myAgent.push(options[1])
                    return;
                } else if (reply.type == "generate_another") {
                    console.log(colors.bgcyan, "[Received reply] changing plan", resetColor)
                    if (options[0] == "go_pick_up") forget_parcel_id = options[0][4]
                    else forget_position = { coordinates: [options[0][2], options[0][3]], time: Date.now() }
                    return;
                } else if (reply.type == "go_ahead") { }
            }
        }
        //====================================message

        last_options = options;
        await myAgent.push(options[0]);
    }
}

var forget_parcel_id = null;
class IntentionRevision {

    #intention_queue = new Array();

    get intention_queue() {
        return this.#intention_queue;
    }

    async loop() {
        let loop_counter = 0;
        while (true) {
            // keep the partner updated 
            if (global.communication.partner_id && message_timer()) {
                say_to_teammate("beliefset_parcels", beliefSet_parcels)
                beliefSet_agents.set(global.me.id, global.me)
                say_to_teammate("beliefset_agents", beliefSet_agents)
            }
            // if stuck for some reason 
            if (plan_following_status.active && Date.now() - plan_following_status.last_message_received > killing_time_for_next_step_of_plan) {
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
                    });

                // Remove from the queue
                this.intention_queue.shift();
            } else {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + "No intention found")
                option_generation(3);
            }
            // update beliefs for possible deletions
            if (Date.now() - lastParcelSensingTime > 7000) {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'Generating empty parcelsensing event');
                updateParcelsBelief([]);
                lastParcelSensingTime = Date.now();
            }

            if (Date.now() - lastAgentSensingTime > 7000) {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'Generating empty agentsensing event');
                updateAgentsBelief([]);
                lastAgentSensingTime = Date.now();
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
                if (logs) console.log("[Intentions]---check-if-replace------>", last.predicate, "----with----", predicate);
                /*for(let i=0; i<=1000000000;i++){
                }*/
                if ((last.predicate[0] == predicate[0]) && (last.predicate[2] == predicate[2]) && (last.predicate[3] == predicate[3])) {
                    last.predicate[1] = predicate[1];
                    return;
                }
                else if (last.predicate[1] > predicate[1]) {
                    return; // intention is already being achieved
                }

            }
            else {
                if (logs) console.log("[Intentions] ---> no last in the queue");
            }
        }

        if (logs) console.log('[Intentions] ---> IntentionRevisionReplace.push', predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);
        // if i'm changing plan release the other agent
        if (last) {
            if (last.predicate[0] == "generate_plan")
                try { reply_for_plan.reply("stop") } catch (err) { console.log(err) }
            // Force current intention stop 

            last.stop();
        }
    }

    async remove_plan() {
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        if (logs) console.log("[Intentions] ---> delete plan execution");
        if (last &&
            (last.predicate[0] == "generate_plan" || last.predicate[0] == "follow_plan")) {
            last.stop();
            if (last.predicate[0] == "generate_plan") {
                try { reply_for_plan.reply({ msg: "stop" }) } catch (err) { console.log(err) }
            } else if (last.predicate[0] == "follow_plan") {
                say_to_teammate("release_me", null)
            }
            this.intention_queue.shift();
        }
    }
}



/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevisionReplace();
// const myAgent = new IntentionRevisionRevise();
myAgent.loop();


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
            this.#parent.log('\t', ...args)
        else
            console.log(...args)
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

            // if stopped then quit
            if (this.stopped) throw ['stopped intention', ...this.predicate];

            // if plan is 'statically' applicable
            if (planClass.isApplicableTo(...this.predicate)) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log('succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    console.log(error)
                    this.log('failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', ...error);
                }
            }

        }

        // if stopped then quit
        if (this.stopped) throw ['stopped intention', ...this.predicate];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate]
    }

}///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Plan library
 */
const planLibrary = [];

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop() {
        // this.log( 'stop plan' );
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
            if (logs) console.log(...args)
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention(predicate) {
        const sub_intention = new Intention(this, predicate);
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }

}



class Plan_single extends Plan {
    // Plan for the sigle agent
    static isApplicableTo(intention) {
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_deliver');
    }

    async execute(intention, priority, x, y) {

        let plan = await generate_plan(intention, x, y, 0);
        console.log("executing:", intention, priority, x, y)
        if (this.stopped) throw ['stopped'];
        if (!plan || plan.length === 0) {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "plan not found" + resetColor);
            throw ['failed (no plan found)'];
        }
        else {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "plan found");
            for (let step of plan) {
                if (this.stopped) throw ['stopped'];
                let action = step.action;
                if (action == "MOVE") {
                    let [ag, from, to] = step.args;
                    if (logs) console.log(colors.green + "[plan]" + resetColor + " starting moving to", to);
                    const regex = /P(\d+)_(\d+)/;
                    const match = to.match(regex);
                    if (match) {
                        var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
                    }
                    else {
                        throw new Error(`Invalid position format: ${position}`);
                    }
                    let counter = 0;
                    while (me.x != x || me.y != y) {
                        let last_action = null
                        if (this.stopped) {
                            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STOPPED");
                            throw ['stopped'];
                        }
                        let me_tmp = { x: me.x, y: me.y };
                        if (x < me.x) {
                            last_action = "left";
                            await client.move('left');
                        }
                        else if (x > me.x) {
                            last_action = "right";
                            await client.move('right');
                        }
                        else if (y > me.y) {
                            last_action = "up";
                            await client.move('up');
                        }
                        else if (y < me.y) {
                            last_action = "down";
                            await client.move('down');
                        }
                        if ((me.x == me_tmp.x) && (me.y == me_tmp.y) && (counter < 3)) {
                            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> retrying");
                            counter++;
                            continue;
                        }
                        else if (counter == 3) {
                            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STUCKED");
                            throw [colors.green + "[plan]" + resetColor + 'stucked'];
                        }
                        else {
                            me.x = x;
                            me.y = y;
                        }
                        if (logs) console.log(colors.green + "[plan]" + resetColor + intention, x, y, last_action);
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    await client.pickup();
                    updateParcelsBelief([]);
                    if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} grab ${ob} in ${pos}`);
                } else if (action == "DROP") {
                    let [ag, ob, pos] = step.args;
                    await client.putdown();
                    updateParcelsBelief([]);
                    if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} drop ${ob} in ${pos}`);
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
            if (logs) console.log(colors.green + "[plan]" + resetColor + "plan not found" + resetColor);
            while (reply_for_plan.reply == undefined) {
                if (Date.now() - last_reply.time > killing_time_for_next_step_of_plan) throw ['failed (no plan found) and no reply obtained'];
                await sleep(500)
            }
            throw ['failed (no plan found)'];

        }
        else {
            let last_reply_time
            let reply = null;
            for (let step of plan) {
                last_reply_time = Date.now()
                //active loop for waiting the partner
                while (reply_for_plan.reply == undefined) {
                    console.log(colors.bgcyan, "[Generate_plan]", resetColor, reply_for_plan, last_reply_time)
                    if (reply_for_plan.msg.msg == "stop") {
                        throw ["stopped by partner"]
                    }
                    if (Date.now() - last_reply_time.time > killing_time_for_next_step_of_plan) return "failure"
                    // to avoid that node microcode doesn't let the events activate for the messages
                    await sleep(refresh_time_for_plan)
                    if (this.stopped) throw ["stopped by partner"]
                }
                reply_for_plan.status = "not_received"
                console.log("received reply")

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

                        if (logs) console.log(colors.green + "[plan]" + resetColor + " starting moving to", to);
                        const regex = /P(\d+)_(\d+)/;
                        const match = to.match(regex);
                        if (match) {
                            var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
                        }
                        else {
                            throw new Error(`Invalid position format: ${position}`);
                        }
                        let counter = 0;
                        while (me.x != x || me.y != y) {
                            let last_action = null
                            if (this.stopped) {
                                if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STOPPED");
                                //???? send the 'stap waiting' message
                                throw ['stopped'];
                            }
                            let me_tmp = { x: me.x, y: me.y };
                            if (x < me.x) {
                                last_action = "left";
                                await client.move('left');
                            }
                            else if (x > me.x) {
                                last_action = "right";
                                await client.move('right');
                            }
                            else if (y > me.y) {
                                last_action = "up";
                                await client.move('up');
                            }
                            else if (y < me.y) {
                                last_action = "down";
                                await client.move('down');
                            }
                            if ((me.x == me_tmp.x) && (me.y == me_tmp.y) && (counter < 3)) {
                                if (logs) console.log(colors.green + "[plan]" + resetColor + "-> retrying");
                                counter++;
                                continue;
                            }
                            else if (counter == 3) {
                                if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STUCKED");
                                throw [colors.green + "[plan]" + resetColor + 'stucked'];
                            }
                            else {
                                me.x = x;
                                me.y = y;
                            }
                            if (logs) console.log(colors.green + "[plan]" + resetColor + intention, x, y, last_action);
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
                        updateParcelsBelief([]);

                        if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} grab ${ob} in ${pos}`);
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
                        if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} drop ${ob} in ${pos}`);
                    }
                }
            }
            reply_for_plan.reply({ msg: "stop" })

            //send(partner plan_terminated); //???? send the 'stap waiting' message
            return "success";

        }
    }
}

class Plan_receiver extends Plan {
    static isApplicableTo(intention) {
        return (intention == 'follow_plan'); //???? non so cosa ci va
    }

    async execute(intention, priority) { //???? adattala come vuoi
        console.log(colors.bgcyan, "Starting receiving plan", resetColor)
        plan_following_status.last_message_received = Date.now()
        plan_following_status.active = true

        while (plan_following_status.active) {  //???? set to receive the terminal message
            let step //= wait_instruction //????
            let reply = await client.ask(global.communication.partner_id, { type: "following", msg: "i'm here" })
            plan_following_status.last_message_received = Date.now()

            console.log(colors.bgcyan, "My step is:", resetColor, reply)
            if (reply.msg == "stop") {
                plan_following_status.active = false
                return "success"
            }
            if (reply.msg == "stay_put") continue
            step = reply.obj
            let action = step.action;
            if (action == "MOVE_COOP") {
                let [ag, ag2, from, to] = step.args;
                if (logs) console.log(colors.green + "[plan]" + resetColor + " starting moving to", to);
                const regex = /P(\d+)_(\d+)/;
                const match = to.match(regex);
                if (match) {
                    var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
                }
                else {
                    throw new Error(`Invalid position format: ${position}`);  //???? come gestiamo gli errori? (send(fail) or something else)
                }
                let counter = 0;
                while (me.x != x || me.y != y) {
                    let last_action = null
                    let me_tmp = { x: me.x, y: me.y };
                    if (x < me.x) {
                        last_action = "left";
                        await client.move('left');
                    }
                    else if (x > me.x) {
                        last_action = "right";
                        await client.move('right');
                    }
                    else if (y > me.y) {
                        last_action = "up";
                        await client.move('up');
                    }
                    else if (y < me.y) {
                        last_action = "down";
                        await client.move('down');
                    }
                    if ((me.x == me_tmp.x) && (me.y == me_tmp.y) && (counter < 3)) {
                        if (logs) console.log(colors.green + "[plan]" + resetColor + "-> retrying");
                        counter++;
                        continue;
                    }
                    else if (counter == 3) {
                        if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STUCKED");
                        throw [colors.green + "[plan]" + resetColor + 'stucked'];
                    }
                    else {
                        me.x = x;
                        me.y = y;
                    }
                    if (logs) console.log(colors.green + "[plan]" + resetColor + intention, x, y, last_action);
                }
            } else if (action == "GRAB") {
                let [ag, ob, pos] = step.args;
                await client.pickup();
                updateParcelsBelief([]);

                if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} grab ${ob} in ${pos}`);
            } else if (action == "DROP") {
                let [ag, ob, pos] = step.args;
                await client.putdown();
                delete_put_down();
                updateParcelsBelief([]);

                if (logs) console.log(colors.green + "[plan]" + resetColor + `${ag} drop ${ob} in ${pos}`);
            }
        }
        return "success";
    }
}

class Plan_random_move extends Plan {//????
    //...
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

//planLibrary.push(Plan_random_move);

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




async function generate_plan(intention, x, y, coop) { //???? riposizionare al termine
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
    myBeliefset.declare(`on me p${me.x}_${me.y}`);
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
        myBeliefset.declare(`on partner p${partner.x}_${partner.y}`);
        myBeliefset.declare(`different partner me`);
        myBeliefset.declare(`different me partner`);
        if (intention == 'go_deliver') {
            myBeliefset.declare(`holding partner target`); //????to define who has the package (me or partner)
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
    /*let delivery = false;
    let delivery_priority=0;*/
    let nearest_delivery_point;
    let parcels_on_me_counter = 0;
    let parcels_on_me_reward = 0;
    for (const parcel of beliefSet_parcels.values()) {
        if (parcel.carriedBy == global.me.id) {
            parcels_on_me_reward += parcel.reward;
            parcels_on_me_counter += 1;
        }
    }
    if (communication_logs)
        console.log(colors.bgmagenta + "[Forget options]" + resetColor + colors.yellow + forget_parcel_id + resetColor)

    for (const parcel of beliefSet_parcels.values()) {
        // This happens when the Master tells to forget a parcel or the Master itself says to the Slave to pickit up
        if (parcel.carriedBy == global.me.id || parcel.id == forget_parcel_id) {
            continue;
        }

        let distance_parcel = distance_path(me, parcel, consider_partner);
        if (!distance_parcel) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find path to", parcel);
            continue;
        }
        nearest_delivery_point = get_nearest_delivery_point_manhattan(parcel);
        if (!nearest_delivery_point) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find nearest delivery point for", parcel);
            continue;
        }
        if (decay_time) {
            var priority = parcel.reward + parcels_on_me_reward - ((distance_parcel + nearest_delivery_point.distance) * (parcels_on_me_counter + 1)) / (4 * decay_time);
        }
        else {
            var priority = parcel.reward + parcels_on_me_reward - 2 * parcels_on_me_counter;
        }
        options.push(['go_pick_up', priority, parcel.x, parcel.y, parcel.id]);
    }
    if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + parcels_on_me_counter + " parcels on me");

    if (parcels_on_me_counter) {
        nearest_delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
        if (!nearest_delivery_point) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find path for nearest delivery point");
        }
        else {
            let distance = nearest_delivery_point.distance;//distance_path(me, nearest_delivery_point_delivery);
            if (decay_time) {
                var priority = parcels_on_me_reward - (parcels_on_me_counter * distance) / (4 * decay_time);
            }
            else {
                var priority = parcels_on_me_reward;
            }
            options.push(['go_deliver', priority, nearest_delivery_point.x, nearest_delivery_point.y]);
        }
    }
    return options;
}



