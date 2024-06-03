import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
import { Utilities as ut } from "./Utilities.js"

const logs = true;
const communication_logs = true;
/* 
    Da aggingere la parte di aggiornamento delle opzioni,
    aggiungere i posti di default,
  */

let token = ""
let name = ""
if (process.argv[2] !== undefined) name = "?name=" + process.argv[2]
if (process.argv[3] !== undefined) token = process.argv[3]

const client = new DeliverooApi(
    'http://localhost:8080/' + name,
    token
)


//???-migliorare maxValue
function generate_favorite_coordinates() {
    const temporaryGridMap = new Map();
    for (let tile of map.spawnable_tiles) {
        const { x, y } = tile;
        for (let i = x - 1; i <= x + 1; i++) {
            for (let j = y - 1; j <= y + 1; j++) {
                if ((i >= 0) && (i < map.width) && (j >= 0) && (j < map.height)) {
                    const key = `${i}_${j}`;
                    temporaryGridMap.set(key, (temporaryGridMap.get(key) || 0) + 1);
                }
            }
        }
    }
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const value of temporaryGridMap.values()) {
        if (value > maxValue) {
            maxValue = value;
        }
    }
    const resultList = [];

    for (let tile of map.spawnable_tiles) {

        let x = tile.x;
        let y = tile.y;
        const key = `${x}_${y}`;
        const value = temporaryGridMap.get(key);
        //tiles per spawnable tiles
        if (value !== undefined && (value > maxValue / 2 || (map.height * map.width) / map.spawnable_tiles.length > 10)) {
            resultList.push({ x, y, value, time: start - favorite_position_choosing_time });
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








const map = {};
var delivery_grid = []//used for quick reference for when i pass on a delivery point
var favorite_position_choosing_time;
client.onMap((width, height, tiles) => {
    //if(logs) console.log(colors.yellow + "[onMap]" +resetColor+ " receiving map");
    map.width = width;
    map.height = height;
    map.tiles = tiles;

    let delivery_tiles = [];
    let spawnable_tiles = [];
    for (let tile of tiles) {
        if (tile.delivery) delivery_tiles.push(tile);
        if (tile.parcelSpawner) spawnable_tiles.push(tile);
    }
    map.delivery_tiles = delivery_tiles;
    map.spawnable_tiles = spawnable_tiles;

    //if(logs) console.log("CARATTERISTICHE MAPPA", width, height, tiles);
    favorite_position_choosing_time = map.height * map.width * config.MOVEMENT_DURATION / 10;
    if (favorite_position_choosing_time < 3000) favorite_position_choosing_time = 3000;
    map.favorite_coordinates = generate_favorite_coordinates();
    if (logs) console.log(map.favorite_coordinates);
    delivery_grid = Array.from({ length: map.height }, () => Array(map.width).fill(false))
    for (const tile of map.delivery_tiles) {
        delivery_grid[tile.x][tile.y] = true;
    }
})


/**
 * Beliefset revision function
 */
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

global.communication = { master: false, partner_id: null }

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
            //communication between partners has protocol the excange of messages  msg.type and msg.obj
            if (id == global.communication.partner_id) {//if is the partner
                if (communication_logs)
                    console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, msg.type)

                if (msg.type == "beliefset_agents") {
                    let obj = ut.jsonToMap(msg.obj)
                    if (obj.size > 0) {
                        console.log(colors.bgmagenta, "[PartnerMessage] before ", resetColor, colors.blue,
                            ut.printBeliefAgents(beliefSet_agents), "obj:\n", ut.printBeliefAgents(obj))
                        for (const [key, a] of obj) {
                            a.viewable = false
                            if (beliefSet_agents.has(a.id)) {
                                if (a.time < beliefSet_agents.get(a.id).time) {
                                    beliefSet_agents.set(a.id, a)
                                }
                            } else beliefSet_agents.set(a.id, a)
                        }
                        if (communication_logs)
                            console.log(colors.bgmagenta, "[PartnerMessage] after ", resetColor, colors.blue, ut.printBeliefAgents(beliefSet_agents), resetColor)
                    }
                } else
                    if (msg.type == "beliefset_parcels") {
                        let obj = ut.jsonToMap(msg.obj)
                        console.log(colors.bgmagenta, "[PartnerMessage] before ", resetColor, colors.yellow,
                            msg.obj, "obj:\n", ut.printBeliefParcels(obj))
                        if (obj.size > 0) {
                            for (const [key, a] of obj) {
                                a.viewable = false
                                if (beliefSet_parcels.has(a.id)) {
                                    if (a.time < beliefSet_parcels.get(a.id).time) {
                                        beliefSet_parcels.set(a.id, a)
                                    }
                                } else beliefSet_parcels.set(a.id, a)
                            }
                            console.log(colors.bgmagenta, "[PartnerMessage] after ", resetColor, colors.yellow, ut.printBeliefParcels(beliefSet_parcels), resetColor)
                        }
                    } else if (msg.type == "option_communication") {
                        let partner_options = msg.obj
                        console.log(colors.bgmagenta, "[PartnerMessage] option communication ", resetColor, partner_options)

                        let current_intention = myAgent.intention_queue.at(myAgent.intention_queue.length - 1)
                        if (current_intention) {
                            console.log(colors.bgmagenta, "[PartnerMessage]  Comparing: ", resetColor, partner_options[0], "--->", current_intention.predicate)
                            if (partner_options[0][0] == current_intention.predicate[0] && (partner_options[0][0] === "go_pick_up" || partner_options[0][0] === "go_to")) {

                                if ((current_intention.predicate[2] == partner_options[0][2] && current_intention.predicate[3] == partner_options[0][3]) && // same end Position
                                    (partner_options[0][0] === "go_pick_up" || partner_options[0][0] === "go_to") && // these actions
                                    (current_intention.predicate[1] > partner_options[0][1] || // my priority on it is bigger
                                        (current_intention.predicate[1] == partner_options[0][1] && global.me.id > communication.partner_id)) // if the priority is the same if,I'm bigger i go
                                    ) {
                                    console.log(colors.bgmagenta, "[Reply]  I'm on my way, generate another")
                                    reply({type:"generate_another"})
                                } else {
                                    reply({ type: "go_ahead" })
                                    console.log(colors.bgmagenta, "[Reply]  I'm generating another options",)
                                    if (partner_options[0][0] == "go_pick_up")
                                        forget_parcel_id = partner_options[0]
                                    else if (partner_options[0][0] == "go_to") {
                                        forget_position = [partner_options[0][2], partner_options[0][3]]
                                    }
                                    current_intention.stop()
                                    option_generation(4)
                                }
                            } else ("go_ahead")
                        } else ("go_ahead")
                    } else if (msg.type == "you_block_me") {
                        let partner_options = msg.obj.options
                        let partner_status = msg.obj.status
                        console.log(colors.bgmagenta, "[PartnerMessage]", resetColor, "I'm Blocking: partner asks for help")
                        if ((last_options[0][0] == "go_deliver" || last_options[0][0] == "go_pick_up") && last_options[0][1] - partner_options[0][1] > 2) {
                            console.log(colors.bgmagenta, "[Reply] option communication ", resetColor, colors.red, "I_ignore_you")
                            reply({ type: "i_ignore_you" })
                        } else {
                            reply({ type: "plan", obj: ["💬", "💬", "💬", "💬", "💬", "💬", "💬"] })
                            console.log(colors.bgmagenta, "[Reply] option communication ", resetColor, colors.red, "A Plan")
                        }
                    }
                    else { console.log("⚠️⚠️⚠️" + colors.red + " TEAMMATE SENT A NON SUPPORTED MESSAGE TYPE" + resetColor) }
            } else//non partner messages
                if (communication_logs)
                    console.log("received:", id, name, msg, reply)
});

var last_message_sent = 0;

function message_timer() {
    if (Date.now() - last_message_sent > 700) {
        last_message_sent = Date.now();
        return true
    } else return false
}

function say_to_teammate(msg_type, obj) {
    //if (communication_logs) console.log("Sending:", { type: msg_type, obj:obj })

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
client.onAgentsSensing(async (agents) => { //intanto no memoria sugli agenti
    if ((agents != undefined) && (agents.length != 0)) {
        if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "agent_sensing");
        time = Date.now(); // absolute time is needed when communicating to define which percept is most recent
        for (let a of agents) {

            a.time = time
            beliefSet_agents.set(a.id, a);


            //update on all beliefs

            for (const [key, a] of beliefSet_agents) {
                //viewable
                (distance_manhattan(global.me, a) > config.AGENTS_OBSERVATION_DISTANCE) ? a.viewable = false : a.viewable = true
                if (!a.viewable & Date.now() - a.time > 100) a.action = "lost"
                beliefSet_agents.set(a.id, a);
            }
        }

        if (logs) console.log(colors.yellow + "[onAgents]" + resetColor + "memory agents:\n" + ut.printBeliefAgents(beliefSet_agents));
        option_generation(1);
    }
})


/**
 * Options generation and filtering function
 */
var parcel_grid = []
client.onParcelsSensing(async parcels => {
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

        if (!global.option_generation_occupied)

            option_generation(2);
    }
})
var last_options = null;

var forget_position = null
let last_option_generated = 0
async function option_generation(caller_method_id) {             //??? migliorare percorsi

    if (Date.now() - last_option_generated > 300) {
        last_option_generated = Date.now();
        //if the caller is the main loop, to avoid error, make it loop
    } else if (caller_method_id == 3) while (Date.now() - last_option_generated > 300) { }
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
        //if i can generate options, means that we block each other and can be that
        // we maybe need to call the planner
        if (options_2.length != 0) {
            if (global.communication.partner_id) {
                let reply = await ask_teammate("you_block_me", { status: global.me, options: options_2 })
                console.log(colors.blue + "[opt_gen]" + resetColor + "The Allied sent a plan");
                if (reply.type == "plan")
                    options.push["follow_plan", 999, reply.obj]
            }
        }
    }

    /**
     * Options filtering
     */
    if (map.favorite_coordinates) {
        if (options.length == 0) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "no option");
            //let time = config.MOVEMENT_DURATION*map.favorite_coordinates.length;
            let option_is_generated = false;
            for (let position of map.favorite_coordinates) {
                //======message
                if (forget_position != null && forget_position[0] == position.x && forget_position[1] == position.y) continue;
                /*                 if(distance_manhattan(me,position)>10){
                                    continue;
                                } */
                if (global.me.x == position.x && global.me.y == position.y) {
                    position.time = Date.now();
                    continue;
                }
                //if(logs) console.log(position, Date.now()-position.time,config.MOVEMENT_DURATION)
                if (Date.now() - position.time > favorite_position_choosing_time) {
                    let distance = distance_path(global.me, position, true);
                    //if(logs) console.log("##########################",me,position,distance)
                    if (distance) {
                        //-100 to make the go_to always the worst option
                        options.push(["go_to", position.value - distance - 100, position.x, position.y]);
                        option_is_generated = true
                    }
                }
            }
            //to not let the agent stuck it will be generated a random move if no other action is available
            if (!option_is_generated) {
                options.push(["random_move",-Infinity , 0, 0]);

            }
        }


        //if(logs) console.log("OPTIONS",options)
        /*         for (const option of options) {
                    if (option[1] > max_priority) {
                        max_priority = option[1];
                        best_option = option;
                    }
                } */

        options.sort(function (a, b) {
            return a[1] - b[1];
        });
    }

    /**
     * Best option is selected
     */
    //====================================message
    if (options[0]) {
        if (global.communication.partner_id && (options[0][0] == "go_pick_up" || options[0][0] == "go_deliver" || options[0][0] == "go_to")) {
            if (message_timer()) {
                let reply = await ask_teammate("option_communication", options)
                if (reply.type == "plan") {
                    //reply.obj
                    console.log(colors.blue + "[opt_gen]" + resetColor + "received a plan", reply.obj)
                } else if (reply.type == "go_with_second") {
                    last_options = options;
                    myAgent.push(options[1])
                    return;
                } else if (reply.type == "generate_another") {
                    console.log(colors.bgcyan, "[Received reply] changing plan", resetColor)
                    if (options[0] == "go_pick_up") forget_parcel_id = options[0][4]
                    else forget_position = [options[0][2], options[0][3]]
                    return;
                } else if (reply.type == "go_ahead") { }
            }
        }
        //====================================message

        last_options = options;
        myAgent.push(options[0]);
    }
}

var forget_parcel_id = null;

// client.onAgentsSensing( agentLoop )
// client.onYou( agentLoop )

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/**
 * Intention revision loop
 */
var no_intention_conter = 0
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue() {
        return this.#intention_queue;
    }

    async loop() {
        let loop_counter = 0;
        while (true) {
            if (global.communication.partner_id && message_timer()) {
                say_to_teammate("beliefset_parcels", beliefSet_parcels)
                say_to_teammate("beliefset_agents", beliefSet_agents)

            }

            let current_intention = this.intention_queue.at(this.intention_queue.length - 1)
            if(current_intention !==undefined)
                if (map.favorite_coordinates) {
                    for (let coordinates in map.favorite_coordinates) {
                        if (!(current_intention.predicate[0] == "go_to" && current_intention.predicate[2] == coordinates.x && current_intention.predicate[3]==coordinates.y))
                            if (distance_manhattan(global.me, coordinates) <= config.PARCELS_OBSERVATION_DISTANCE)
                                coordinates.time = Date.now()
                    }
                }


            if (logs) console.log(colors.red + "[main_loop]" + resetColor + "==================================================================>", loop_counter++);
            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                no_intention_conter = 0
                try {
                    if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'intentionRevision.loop', this.intention_queue.map(i => i.predicate));

                } catch (error) {
                    if (logs) console.log(error)
                }

                // Current intention
                const intention = this.intention_queue[0];

                //this.intention_queue.shift();
                //for(let i=0; i<=1000000000;i++){}

                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                /*
                let id = intention.predicate[4]
                let p = beliefSet_parcels.get(id)
                if (p && p.carriedBy) {
                    if(logs) console.log('Skipping intention because no more valid', intention.predicate)
                    continue;
                }*/

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
        //if (last && last.predicate.join(' ') == predicate.join(' ')) {
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

        if (logs) console.log('[Intentions] ---> IntentionRevisionReplace.push', predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);

        // Force current intention stop 
        if (last) {
            last.stop();
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
            if (logs) console.log(...args)
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
            if (this.stopped) throw ['[achieve intent]stopped intention', ...this.predicate];

            // if plan is 'statically' applicable
            if (planClass.isApplicableTo(this.predicate[0])) {
                // plan is instantiated
                this.#current_plan = new planClass(this.#parent);
                this.log('[achieve intent]achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log('[achieve intent] succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log('[achieve intent]failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
                }
            }

        }

        // if stopped then quit
        if (this.stopped) throw ['[achive intent]stopped intention', ...this.predicate];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['[achive intent]no plan satisfied the intention ', ...this.predicate]
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

class GoPickUp extends Plan {

    static isApplicableTo(intention) {
        return intention == 'go_pick_up';
    }

    async execute(desire, priority, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await this.subIntention(['go_to', priority, x, y]);
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await client.pickup();
        //await new Promise((resolve) => {setTimeout(resolve, 300)});
        delete_parcels_here(); // if the beliefset is not update remove the phantom parcel
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
    }
}

class Deliver extends Plan {

    static isApplicableTo(intention) {
        return intention == 'go_deliver';
    }

    async execute(desire, priority, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await this.subIntention(['go_to', priority, x, y]);
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await client.putdown();
        delete_put_down();
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
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
    }
}
function getRandomDirection() {
    const directions = ["up", "down", "left", "right"];
    const randomIndex = Math.floor(Math.random() * directions.length);
    return directions[randomIndex];
}

class GoTo extends Plan {

    static isApplicableTo(intention) {
        return intention == 'go_to';
    }

    async execute(intention, priority, x, y) {
        if (logs) console.log(colors.green + "[plan]" + resetColor + "-> starting movement from" + global.me.x, global.me.y + " to ->", x, y);
        let path = pathfind(global.me, { x: x, y: y });
        //console.log(path)
        if (path == null) {
            if (logs) console.log(colors.green + "[plan]" + resetColor + "-> path null");
            throw ['failed (no path found)'];
        }
        let step_counter = 1;
        //let grid = ut.generategrid(map, beliefSet_agents.values())
        //if(logs) console.log(ut.printGridSEPath(grid,me,{ x: x, y: y },path))
        let counter = 0;
        while (global.me.x != x || global.me.y != y) {
            let last_action = null //to_remove
            if (this.stopped) {
                if (logs) console.log(colors.green + "[plan]" + resetColor + "-> execute STOPPED");
                throw ['stopped'];
            }

            let me_tmp = { x: global.me.x, y: global.me.y };
            if (path[step_counter][0] < global.me.x) {
                last_action = "left";
                await client.move('left');
            }
            else if (path[step_counter][0] > global.me.x) {
                last_action = "right";
                await client.move('right');
            }
            else if (path[step_counter][1] > global.me.y) {
                last_action = "up";
                await client.move('up');
            }
            else if (path[step_counter][1] < global.me.y) {
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
                global.me.x = path[step_counter][0];
                global.me.y = path[step_counter][1];
                step_counter += 1;
            }// if me on a delivery point of the grid, put down
            if (delivery_grid[global.me.x][global.me.y]) {
                await client.putdown();
                delete_put_down();
            }
            if (parcel_grid[global.me.x][global.me.y]) {
                await client.pickup();
                delete_parcels_here();
            }
            if (logs) console.log(colors.green + "[plan]" + resetColor + intention, x, y, step_counter, path[step_counter - 1], last_action);
        }
        console.log(colors.green + "[plan]" + resetColor + '-> target reached')
        return "success";
    }
}




// plan classes are added to plan library 
planLibrary.push(GoPickUp);
planLibrary.push(GoTo);
planLibrary.push(Deliver);
planLibrary.push(RandomMove);


process.on('SIGINT', () => {
    console.log('Received SIGINT. Custom stack trace:');
    ut.logStackTrace();
    process.exit();
});


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
        nearest_delivery_point = get_nearest_delivery_point_path(parcel, consider_partner);
        if (!nearest_delivery_point) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find nearest delivery point to", parcel);
            continue;
        }
        if (decay_time) {
            var priority = parcel.reward + parcels_on_me_reward - ((distance_parcel + nearest_delivery_point.distance) * (parcels_on_me_counter + 1)) / (4 * decay_time);
        }
        else {
            var priority = parcel.reward + parcels_on_me_reward - 2 * parcels_on_me_counter;
        }
        options.push(['go_pick_up', priority, parcel.x, parcel.y, parcel.id]);

        if (parcels_on_me_counter) { //second option
            let distance_delivery = distance_path(global.me, nearest_delivery_point, consider_partner);
            if (!distance_delivery) {
                if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find path to delivery");
                continue;
            }
            priority = parcels_on_me_reward + parcel.reward - ((parcels_on_me_counter + 1) * distance_delivery + nearest_delivery_point.distance * 2) / (4 * decay_time);
            options.push(['go_deliver', priority, nearest_delivery_point.x, nearest_delivery_point.y]);
        }
    }

    if (parcels_on_me_counter) {
        nearest_delivery_point = get_nearest_delivery_point_path(global.me, consider_partner);
        if (!nearest_delivery_point) {
            if (logs) console.log(colors.blue + "[opt_gen]" + resetColor + "unable to find nearest delivery point");
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