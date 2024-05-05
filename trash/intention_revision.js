import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
/* import { Plan,º,BlindMove } from './plans.js';
import { Intention,IntentionRevision,IntentionRevisionReplace,IntentionRevisionRevise } from './intention.js';
 */

const client = new DeliverooApi(
    //'https://deliveroojs.onrender.com/',
    //'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJhYjVkMWY0MThjIiwibmFtZSI6ImVtbWF2aWNvIiwiaWF0IjoxNzEyNjU2NjIyfQ.ewbf7vWIGkOorEx1YnMFYTbJ6RWXWaL8OvUAK_6MX90'
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY4OTAwZWE1NmViIiwibmFtZSI6ImVtbWF2aWNvIiwiaWF0IjoxNzE0NTY4Mjc0fQ.Lr_L4aaiIVss76T0QZuFiS950lIaVsRXsK7W80h8hMs'
)

function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}

const map = {};
var pathfinder;
client.onMap((width, height, tiles) => {
    map.width = width;
    map.height = height;
    map.tiles = tiles;
    console.log("CARATTERISTICHE MAPPA", width, height, tiles)
    pathfinder = new Pathfinder(map.width, map.height)
})




var AGENTS_OBSERVATION_DISTANCE;
client.onConfig((config) => {
    console.log("Config", config)
    client.onConfig(config => AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE)
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
    agentLoop("me")
})
global.parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
    for (const p of perceived_parcels) {
        parcels.set(p.id, p)
    }
    agentLoop("parcels")
})
global.agents;

const beliefSet = new Map();
let time = 0;
const start = Date.now();
client.onAgentsSensing((agent_input) => {
    global.agents = agent_input;
    if (agents != undefined) {
        time = Date.now() - start;

        for (let a of agents) {
            a.time = time
            //compute direction
            if (!beliefSet.has(a.id)) {
                a.action = "justPercepted"
                a.viewable = true
            } else {
                let old_a = beliefSet.get(a.id)

                if (old_a.x > a.x) a.action = "left"
                else if (old_a.x < a.x) a.action = "right"
                else if (old_a.y > a.y) a.action = "down"
                else if (old_a.y < a.y) a.action = "up"
                else a.action = "stationary"
                if (!old_a.viewable) console.log("here we go again:" + a.name)
            }

            beliefSet.set(a.id, a);


            //update on all beliefs
            for (const [key, a] of beliefSet) {
                //viewable
                (distance(me, a) > AGENTS_OBSERVATION_DISTANCE) ? a.viewable = false : a.viewable = true
                if (!a.viewable & Date.now() - a.time > 100) a.action = "lost"
                beliefSet.set(a.id, a);
            }

            let printBelief = Array.from(beliefSet.values()).map(({ id, name, x, y, score, time, action, viewable }) => {
                return `${name}:${x},${y},${score},${time},${action},${viewable}\n`;
            }).join(' ');
            console.log("memory:\n" + printBelief);
        }
    }
    agentLoop("agents")
})




/**
 * Options generation and filtering function
 */
client.onParcelsSensing(parcels => {

    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed

    /**
     * Options generation
     */
    const options = []
    for (const parcel of parcels.values())
        if (!parcel.carriedBy)
            options.push(['go_pick_up', parcel.x, parcel.y, parcel.id]);
    // myAgent.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] )

    /**
     * Options filtering
     */
    let best_option;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if (option[0] == 'go_pick_up') {
            let [go_pick_up, x, y, id] = option;
            let current_d = distance({ x, y }, me)
            if (current_d < nearest) {
                best_option = option
                nearest = current_d
            }
        }
    }

    /**
     * Best option is selected
     */
    if (best_option)
        myAgent.push(best_option)

})

function agentLoop(updateType) {

    //belief_revision_function(updateType)
    //const options = optionGeneration() // desire pick up parcel p1 or p2
    // const selected = select(options) // p1 is closer!
    // intention_queue.push( [ selected.intention, selected.args ] );
}





//////////////////////////////////////////////////////////////////////

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
        if (this.#started) {
            return this;
        }
        else
            this.#started = true;        
        // Trying all plans in the library
        for (let planClass of planLibrary) {
            // if stopped then quit
            if (this.stopped) throw ['stopped intention', ...this.predicate];

            // if plan is 'statically' applicable
            console.log(planClass)

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
                console.log('intentionRevision.loop', this.intention_queue.map(i => i.predicate));
                // Current intention
                const intention = this.intention_queue[0];

                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = parcels.get(id)
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





/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function pathfind(start_pos, end_pos) {
    let grid = pathfinder.generategrid(map, [])
    //console.log(gridPrint(grid))
    let start = new Node(start_pos[0], start_pos[1], 0, 0);
    let end = new Node(end_pos[0], end_pos[1], 0, 0);
    let path = pathfinder.aStar(grid, start, end);
    //console.log("Shortest Path:", path);
    return path;
}

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

    static isApplicableTo(desire, x, y, id) {

        return desire == 'go_pick_up';
    }

    async execute(go_pick_up, x, y) {
        if (this.stopped) throw ['stopped']; // if stopped then quit

        await this.subIntention(['go_to', x, y]);
        if (this.stopped) throw ['stopped']; // if stopped then quit
        await client.pickup()
        if (this.stopped) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class BlindMove extends Plan {

    static isApplicableTo(desire, x, y, id) {
        return desire == 'go_to';
    }

    async execute(desire, x, y, id) {
        console.log("starting movement to:xy", x, y);
        let path = pathfind([me.x, me.y], [x, y])
        while (me.x != x || me.y != y) {
            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let step_counter = 1;
            console.log("step_conter", step_counter)
            let status_x = undefined;
            let status_y = undefined;

            console.log('me', me, 'xy', x, y);

            if (path[step_counter][0] > me.x) {
                console.log("AAAAAAAAAAAAAAAAAAAAAAA")
                status_x = await client.move('right')
                console.log("right", path[step_counter], me)
            }
            else if (path[step_counter][0] < me.x) {
                console.log("AAAAAAAAAAAAAAAAAAAAAAA")
                status_x = await client.move('left')
                console.log('left', path[step_counter], me)
            }
            else if (path[step_counter][1] > me.y) {
                console.log("AAAAAAAAAAAAAAAAAAAAAAA")
                status_y = await client.move('up')
                console.log('up', path[step_counter], me)
            }
            else if (path[step_counter][1] < me.y) {
                console.log("AAAAAAAAAAAAAAAAAAAAAAA")
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
/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevisionReplace();
// const myAgent = new IntentionRevisionRevise();
myAgent.loop();

/**
 * Plan library
 */
const planLibrary = [];


// plan classes are added to plan library 
planLibrary.push(GoPickUp)
planLibrary.push(BlindMove)