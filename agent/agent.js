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

function distance_manhattan({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}

function generate_favorite_coordinates() {
    const temporaryGridMap = new Map();
    for (let tile of map.spawnable_tiles) {
        const { x, y } = tile;
        for (let i = x - 1; i <= x + 1; i++) {
            for (let j = y - 1; j <= y + 1; j++) {
                if (i >= 0 && i < map.width && j >= 0 && j < map.height) {
                    const key = {i,j};
                    temporaryGridMap.set(key, (temporaryGridMap.get(key) || 0) + 1);
                }
            }
        }
    }
    const resultList = [];
    for (let tile of map.tiles) {
        let x = tile.x
        let y = tile.y
        const key = {x,y};
        const value = temporaryGridMap.get(key);
        if (value !== undefined && value !== 0) {
            resultList.push({ x, y, value });
        }
    }
    resultList.sort((a, b) => a.value - b.value);
    return resultList;
}

function distance_path(a, b) {

    let path = pathfind(a, b)
    if (path == null)
        return null
    else return path[0].length
}

function get_nearest_delivery_point_path(a) {
    let min;
    let temp = null;
    for (let delivery_point of map.delivery_tiles) {
        temp = distance_path(a, delivery_point)
        if (temp == null) continue;
        if (temp < min) min = temp
    }
    return min
}

function get_nearest_delivery_point_manhattan(a) {
    let min;
    let temp = null;
    for (let delivery_point of map.delivery_tiles) {

        temp = distance_manhattan(a, delivery_point)
        if (temp == null) continue;
        if (temp < min) min = temp
    }
    return min
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
    console.log(map.favorite_coordinates)
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
    }
})


/**
 * Options generation and filtering function
 */
const options = []
client.onParcelsSensing( parcels => {
    if (parcels != undefined) {
        time = Date.now() - start;

        for (let p of parcels) {
            p.time = time
            //compute direction
            if (!beliefSet_parcels.has(p.id)) {
                p.viewable = true
                beliefSet_parcels.set(p.id, p)
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

            if (p.reward <= 1)
                delete beliefSet_parcels[p.id]
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

function option_generation(){
        /**
     * Options generation
     */

        for (const parcel of beliefSet_parcels.values()) {
            if (!parcel.carriedBy) {
                let distance = distance_path(me, parcel)
                console.log("DISTANCE", distance)
                if (!distance) continue
                let priority = parcel.reward - distance - get_nearest_delivery_point_manhattan({ x: parcel[2], y: parcel[3] })
                options.push(['go_pick_up', priority, parcel.x, parcel.y, parcel.id]);
    
    
            }
            else if (parcel.carriedBy == me.id) {
                let distance = get_nearest_delivery_point_path({ x: parcel[2], y: parcel[3] })
                if (!distance) continue
    
                let already_present = false
                for (let option of options) {
                    // se esiste l'opzione di consegnare, aggiungi reward alla prioditá
                    if (option[0] == "go_deliver") {
                        already_present = true
                        let priority = parcel.reward
                        option[1] = option[1] + priority
                        break
                    }
                }
                if (!already_present) {
                    let priority = parcel.reward - distance
                    options.push(['go_deliver', priority, parcel.x, parcel.y, parcel.id]);
    
                }
            }
    
        }
        // myAgent.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] )
    
        /**
         * Options filtering
         */
    
    
        let best_option;
        let max_priority = 0;
        for (const option of options) {
            if (option[1] > max_priority) {
                max_priority = option[1]
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
        await client.putdown()
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
        if (me.x == x && me.y == y) return;
        while (me.x != x || me.y != y) {
            console.log("POLLO")
            if (this.stopped) throw ['stopped']; // if stopped then quit

            let step_counter = 1;
            console.log("step_conter", step_counter)
            let status_x = undefined;
            let status_y = undefined;

            console.log('me', me, 'xy', x, y);

            if (path[step_counter][0] > me.x) {
                status_x = await client.move('right')
                console.log("right", path[step_counter], me)
            }
            else if (path[step_counter][0] < me.x) {
                status_x = await client.move('left')
                console.log('left', path[step_counter], me)
            }
            else if (path[step_counter][1] > me.y) {
                status_y = await client.move('up')
                console.log('up', path[step_counter], me)
            }
            else if (path[step_counter][1] < me.y) {
                status_y = await client.move('down')
                console.log('down', path[step_counter], me)
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

// plan classes are added to plan library 
planLibrary.push(GoPickUp)
planLibrary.push(BlindMove)
planLibrary.push(Deliver)