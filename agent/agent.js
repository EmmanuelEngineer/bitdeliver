import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
import{Utilities as ut } from "./Utilities.js"

/* 
    Da aggingere la parte di aggiornamento delle opzioni,
    aggiungere i posti di default,
  */
const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY4OTAwZWE1NmViIiwibmFtZSI6ImVtbWF2aWNvIiwiaWF0IjoxNzE0NTY4Mjc0fQ.Lr_L4aaiIVss76T0QZuFiS950lIaVsRXsK7W80h8hMs'
)
var deliver_multiplier = 5
function distance_manhattan(a,b) {
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(a.y))
    return dx + dy;
}

function delete_put_down(){
    for (const p of beliefSet_parcels.values()) {

        if (p.carriedBy == me.id){
            console.log("delete parcel memory")
            beliefSet_parcels.delete(p.id)
        }
    }

}
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
    const resultList = [];
    for (let tile of map.spawnable_tiles) {
        
        let x = tile.x;
        let y = tile.y;
        const key = `${x}_${y}`;
        const value = temporaryGridMap.get(key);
        if (value !== undefined && value !== 0) {
            resultList.push({ x, y, value,time:start });
        }
    }
    resultList.sort((a, b) =>  b.value - a.value);
    return resultList;
}


function distance_path(a, b) {

    let path = pathfind(a, b)
    if (path == null)
        return null
    else return path[0].length
}


function get_nearest_delivery_point_path(a) {
    let min= Number.MAX_VALUE;
    let temp_obj = null;
    let temp_value = null;
    for (let delivery_point of map.delivery_tiles) {
        temp_value = distance_path(a, delivery_point)
        if (temp_value == null) continue;
        if (temp_value < min){
             min = temp_value
             temp_obj = delivery_point;
        }
    }
    return temp_obj
}



function get_nearest_delivery_point_manhattan(a) {
    let min= Number.MAX_VALUE;
    let temp_obj = null;
    let temp_value = null;
    for (let delivery_point of map.delivery_tiles) {
        temp_value = distance_manhattan(a, delivery_point)
        if (temp_value == null) continue;
        if (temp_value < min){
             min = temp_value
             temp_obj = delivery_point;
        }
    }
    return temp_obj
}

function pathfind(start_pos, end_pos) {
    let grid = ut.generategrid(map, beliefSet_agents.values())
    //console.log(ut.printGridSE(grid,start_pos,end_pos))
    let start = new Node(Math.round(start_pos.x), Math.round(start_pos.y), 0, 0);
    let end = new Node(Math.round(end_pos.x), Math.round(end_pos.y), 0, 0);
    let path = Pathfinder.aStar(grid, start, end);
    //console.log("Shortest Path:", path);
    return path;
}
const beliefSet_agents = new Map();
const beliefSet_parcels = new Map();

let time = 0;
const start = Date.now();

const config = {}
client.onConfig((config_input) => {
    console.log("Config", config_input)
    client.onConfig(config_input => {
        config.AGENTS_OBSERVATION_DISTANCE = config_input.AGENTS_OBSERVATION_DISTANCE;
        config.PARCELS_OBSERVATION_DISTANCE = config_input.PARCELS_OBSERVATION_DISTANCE;

    })
})

const map = {};
client.onMap((width, height, tiles) => {
    map.width = width;
    map.height = height;
    map.tiles = tiles;
    let delivery_tiles = []
    for (let tile of tiles) {
        if (tile.delivery) delivery_tiles.push(tile)
    }
    map.delivery_tiles = delivery_tiles;

    let spawnable_tiles = []
    for (let tile of tiles) {
        if (tile.parcelSpawner) spawnable_tiles.push(tile)
    }
    map.spawnable_tiles = spawnable_tiles;
    console.log("CARATTERISTICHE MAPPA", width, height, tiles)
    map.favorite_coordinates = generate_favorite_coordinates()
    //console.log(map.favorite_coordinates)
})


/**
 * Beliefset revision function
 */
const me = {};
client.onYou(({ id, name, x, y, score }) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
})




client.onAgentsSensing( (agents) => {
    if (agents != undefined) {
        time = Date.now() - start;

        for (let a of agents) {
            a.time = time
            //compute direction
            if (!beliefSet_agents.has(a.id)) {
                a.action = "justPercepted"
                a.viewable = true
            } else {
                let old_a = beliefSet_agents.get(a.id)

                if (old_a.x > a.x) a.action = "left"
                else if (old_a.x < a.x) a.action = "right"
                else if (old_a.y > a.y) a.action = "down"
                else if (old_a.y < a.y) a.action = "up"
                else a.action = "stationary"
                if (!old_a.viewable) console.log("here we go again:" + a.name)
            }

            beliefSet_agents.set(a.id, a);


            //update on all beliefs
            for (const [key, a] of beliefSet_agents) {
                //viewable
                (distance_manhattan(me, a) > config.AGENTS_OBSERVATION_DISTANCE) ? a.viewable = false : a.viewable = true
                if (!a.viewable & Date.now() - a.time > 100) a.action = "lost"
                beliefSet_agents.set(a.id, a);
            }

            let printBelief = Array.from(beliefSet_agents.values()).map(({ id, name, x, y, score, time, action, viewable }) => {
                return `${name}:${x},${y},${score},${time},${action},${viewable}\n`;
            }).join(' ');
            console.log("memory:\n" + printBelief);
        }
        option_generation()
    }
})


/**
 * Options generation and filtering function
 */
client.onParcelsSensing( parcels => {
    if (parcels != undefined) {
        time = Date.now() - start;

        for (let p of parcels) {
            p.time = time
            //compute direction
            if (!beliefSet_parcels.has(p.id)) {
                p.viewable = true
                beliefSet_parcels.set(p.id, p)
            }else{
                let el=beliefSet_parcels.get(p.id)
                el.carriedBy = p.carriedBy
                beliefSet_parcels.set(p.id,el)

            }

        }
        //update on all beliefs
        for (const p of beliefSet_parcels.values()) {
            //viewable
            (distance_manhattan(me, p) > config.PARCELS_OBSERVATION_DISTANCE) ? p.viewable = false : p.viewable = true
            if (Date.now() - p.time > 1000) {
                p.reward = p.reward - 1
                p.time = Date.now()
            }

            if (p.reward <= 1){
                console.log("delete parcel memory")
                beliefSet_parcels.delete(p.id)
            }
            else
                beliefSet_parcels.set(p.id, p);

        }

        let printBelief = Array.from(beliefSet_parcels.values()).map(({ id, x, y, reward, time, viewable, carriedBy }) => {
            return `${id}:${x},${y},${reward},${time},${viewable},${carriedBy}\n`;
        }).join(' ');
        console.log("parcel_memory:\n" + printBelief);
    }
    option_generation()
})
 const favorite_coordinates_history = new Map()
function option_generation(){
        /**
     * Options generation
     */
        const options = []


        for (const parcel of beliefSet_parcels.values()) {
            if (!parcel.carriedBy) {
                let distance = distance_path(me, parcel)
                if (!distance) continue
                let nearest_point = get_nearest_delivery_point_manhattan(parcel)
                //console.log("nearest point",nearest_point)
                if (!nearest_point) continue
                let priority = parcel.reward - distance - distance_manhattan(parcel,nearest_point)
                options.push(['go_pick_up', priority, parcel.x, parcel.y, parcel.id]);
            }
            else if (parcel.carriedBy == me.id) {
                let nearest_point = get_nearest_delivery_point_path(parcel)
                if (!nearest_point) continue
                let distance = distance_path(parcel,nearest_point)
                distance = map.width+map.height-distance
                let already_present = false
                for (let option of options) {
                    // se esiste l'opzione di consegnare, aggiungi reward alla prioditá
                    if (option[0] == "go_deliver") {
                        already_present = true
                        let priority = parcel.reward
                        option[1] = option[1] + priority
                        option[2]= nearest_point.x
                        option[3]= nearest_point.y

                        break
                    }
                }
                if (!already_present) {
                    let priority = parcel.reward - distance
                    options.push(['go_deliver', priority, nearest_point.x, nearest_point.y, parcel.id]);
    
                }
            }
    
        }
        // myAgent.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] )
    
        /**
         * Options filtering
         */
    
    
        let best_option;
        let max_priority = Number.MIN_SAFE_INTEGER;
        if (options.length ==0){
                for(let position of map.favorite_coordinates){
                    let now
                    if(position.time-Date.now()<500)continue;
                    let distance = distance_manhattan(me,position)
                    options.push(["go_to",position.x,position.y,position.value-distance])
                }
            
        }
        if (options.length ==0){
            let position = map.favorite_coordinates[0]
            let distance = distance_manhattan(me,position)

                options.push(["go_to",position.x,position.y,position.value-distance])
            }
        

        console.log("OPTIONS",options)

        for (const option of options) {
            if (option[1] > max_priority & option[0]!="go_to") {
                max_priority = option[1]
                best_option = option
            }else if (option[3] > max_priority & option[0]=="go_to") {
                max_priority = option[3]
                best_option = option
            }
        }


        /**
         * Best option is selected
         */
        if (best_option)
        myAgent.push(best_option)
}



// client.onAgentsSensing( agentLoop )
// client.onYou( agentLoop )

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
        while (true) {
            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                try {
                    console.log('intentionRevision.loop', this.intention_queue.map(i => i.predicate));

                } catch (error) {
                    console.log(error)
                }

                // Current intention
                const intention = this.intention_queue[0];

                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = beliefSet_parcels.get(id)
                if (p && p.carriedBy) {
                    console.log('Skipping intention because no more valid', intention.predicate)
                    continue;
                }

                // Start achieving intention
                await intention.achieve()
                    // Catch eventual error and continue
                    .catch(error => {
                        // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
                    });

                // Remove from the queue
                this.intention_queue.shift();
            }
            // Postpone next iteration at setImmediate
            await new Promise(res => setImmediate(res));
        }
    }

    // async push ( predicate ) { }

    log(...args) {
        console.log(...args)
    }

}

class IntentionRevisionQueue extends IntentionRevision {

    async push(predicate) {

        // Check if already queued
        if (this.intention_queue.find((i) => i.predicate.join(' ') == predicate.join(' ')))
            return; // intention is already queued

        console.log('IntentionRevisionReplace.push', predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);
    }

}

class IntentionRevisionReplace extends IntentionRevision {

    async push(predicate) {// the predicate is the same as desire or predicate

        // Check if already queued
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        if (last && last.predicate.join(' ') == predicate.join(' ')) {
            return; // intention is already being achieved
        }

        console.log('IntentionRevisionReplace.push', predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);

        // Force current intention stop 
        if (last) {
            last.stop();
        }
    }

}

class IntentionRevisionRevise extends IntentionRevision {

    async push(predicate) {
        console.log('Revising intention queue. Received', ...predicate);
        // TODO

        // - order intentions based on utility function (reward - cost) (for example, parcel score minus distance)
        // - eventually stop current one
        // - evaluate validity of intention
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
            console.log(...args)
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

    static isApplicableTo(go_pick_up, x, y, id) {
        return go_pick_up == 'go_pick_up';
    }

    async execute(go_pick_up, reward, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await this.subIntention(['go_to', x, y]);
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await client.pickup()
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class Deliver extends Plan {

    static isApplicableTo(desire, x, y, id) {
        return desire == 'go_deliver';
    }

    async execute(desire, reward, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await this.subIntention(['go_to', x, y]);
        if (this.stopped) throw ['stopped']; // if stopped then quit
        console.log("NON LASCIARMI")
        await client.putdown()
        delete_put_down()
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class BlindMove extends Plan {

    static isApplicableTo(go_to, x, y) {
        return go_to == 'go_to';
    }

    async execute(desire, x, y, id) {
        console.log("ARGUMENTS", desire, x, y, id)
        console.log("starting movement to:xy", x, y);
        let path = pathfind(me, { x: x, y: y })
        console.log(path)
        let step_counter = 1;
        let grid = ut.generategrid(map, beliefSet_agents.values())
        console.log(ut.printGridSEPath(grid,me,{ x: x, y: y },path))


        while (me.x != x || me.y != y) {
            let last_action = null
            if (this.stopped) {
                console.log("STOPPED")
                throw ['stopped']; // if stopped then quit
            }

            console.log("step_conter", step_counter)
            let status_x = undefined;
            let status_y = undefined;


            if (path[step_counter][0] < me.x) {
                last_action = "left"
                status_x = await client.move('left')
            }
            else if (path[step_counter][0] > me.x) {
                last_action = "right"
                status_x = await client.move('right')
            }
            else if (path[step_counter][1] > me.y) {
                last_action = "up"
                status_y = await client.move('up')
            }
            else if (path[step_counter][1] < me.y) {
                last_action = "down"
                status_y = await client.move('down')
            }

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            console.log("statues", status_x, status_y)

            if (!status_x && !status_y) {
                console.log("POLLO🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥")
                console.log(desire,x,y,step_counter,path[step_counter],last_action,path)
                console.log('me', me);

                console.log('stucked')
                break;
            } else if (me.x == x && me.y == y) {
                console.log('target reached')
            }
            //is not incremented if stucked
            step_counter += 1;

        }

    }
}

class DropNow extends Plan {

    static isApplicableTo(go_pick_up, x, y, id) {
        return go_pick_up == 'drop_now';
    }

    async execute(go_pick_up, reward, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await client.putdown()
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
    }

}

// plan classes are added to plan library 
planLibrary.push(GoPickUp)
planLibrary.push(BlindMove)
planLibrary.push(Deliver)
planLibrary.push(DropNow)