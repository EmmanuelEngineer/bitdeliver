import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';



const beliefSet = new Map();
let time = 0;
const start = Date.now();




const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY4OTAwZWE1NmViIiwibmFtZSI6ImVtbWF2aWNvIiwiaWF0IjoxNzE0NTY4Mjc0fQ.Lr_L4aaiIVss76T0QZuFiS950lIaVsRXsK7W80h8hMs'
)

function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}

function printGrid(grid) {
    let string = "["
    for (const row of grid) {
        let rowString = '[';
        for (const element of row) {
            rowString += element + ',';
        }
        rowString += "]"
        string += rowString.trim()
        string += "\n"
    }
    string += "]"
    return string
}


const me = {};


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

const available_options = []
function optionsGeneration() {
    
    for (const parcel of parcels.values())
        options.push({ intention: 'pick up parcel', args: [parcel] });
    for (const tile of tiles.values())
        if (tile.delivery) options.push({ intention: 'deliver to', args: [tile] });
}

function select(options) {
    for (const option of options) {
        if (option.intention == 'pick up parcel' && picked_up.length == 0)
            return option;
    }
}



/**
 * Beliefset revision loop
 */

function pathfind(start_pos, end_pos) {
    let grid = pathfinder.generategrid(map, [])
    //console.log(gridPrint(grid))
    let start = new Node(start_pos[0], start_pos[1], 0, 0);
    let end = new Node(end_pos[0], end_pos[1], 0, 0);
    let path = pathfinder.aStar(grid, start, end);
    //console.log("Shortest Path:", path);
    return path;
}

function agentLoop(updateType) {

    belief_revision_function(updateType)
    //const options = optionGeneration() // desire pick up parcel p1 or p2
    // const selected = select(options) // p1 is closer!
    // intention_queue.push( [ selected.intention, selected.args ] );
}
const parcels = new Map()
client.onParcelsSensing(async (perceived_parcels) => {
    for (const p of perceived_parcels) {
        parcels.set(p.id, p)
    }
    agentLoop("parcels")
})
var agents;
client.onAgentsSensing((agent_input) => { agents = agent_input; agentLoop("agents") })
client.onYou(({ id, name, x, y, score }) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    agentLoop("me")
}
)

function belief_revision_function(updateType) {
    // agent update
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
            if (updateType == "agents")
                console.log("memory:\n" + printBelief);
        }
    }
}

function optionGeneration(updateType) {
    if (updateType == "parcels") {
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
    }

    return options

}



/**
 * Intention execution loop
 */
class Agent {




    intention_queue = new Array();

    async intentionLoop() {


        while (true) {
            const intention = this.intention_queue.shift();
            if (intention)
                await intention.achieve();
            await new Promise(res => setImmediate(res));
        }
    }

    async queue(desire, ...args) {
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        const current = new Intention(desire, ...args)
        this.intention_queue.push(current);
    }

    async stop() {
        console.log('stop agent queued intentions');
        for (const intention of this.intention_queue) {
            intention.stop();
        }
    }

}



/**
 * Intention
 */
class Intention extends Promise {

    #current_plan;
    stop() {
        console.log('stop intention and current plan');
        this.#current_plan.stop();
    }

    #desire;
    #args;

    #resolve;
    #reject;

    constructor(desire, ...args) {
        var resolve, reject;
        super(async (res, rej) => {
            resolve = res; reject = rej;
        })
        this.#resolve = resolve
        this.#reject = reject
        this.#desire = desire;
        this.#args = args;
    }

    #started = false;
    async achieve() {
        if (this.#started)
            return this;
        else
            this.#started = true;

        for (const plan of plans) {
            if (plan.isApplicableTo(this.#desire)) {
                this.#current_plan = plan;
                console.log('achieving desire', this.#desire, ...this.#args, 'with plan', plan);
                try {
                    console.log("current Plan", this.#current_plan.desire)
                    const plan_res = await plan.execute(...this.#args);
                    this.#resolve(plan_res);
                    console.log('plan', plan, 'succesfully achieved intention', this.#desire, ...this.#args, 'with result', plan_res);
                    return plan_res
                } catch (error) {
                    console.log('plan', plan, 'failed while trying to achieve intention', this.#desire, ...this.#args, 'with error', error);
                }
            }
        }

        this.#reject();
        console.log('no plan satisfied the desire ', this.#desire, ...this.#args);
        throw 'no plan satisfied the desire ' + this.#desire;
    }

}

/**
 * Plan library
 */
const plans = [];

class Plan {

    stop() {
        console.log('stop plan and all sub intentions');
        for (const i of this.#sub_intentions) {
            i.stop();
        }
    }

    #sub_intentions = [];

    async subIntention(desire, ...args) {
        const sub_intention = new Intention(desire, ...args);
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }

}

class GoPickUp extends Plan {

    isApplicableTo(desire) {
        return desire == 'go_pick_up';
    }

    async execute({ x, y }) {
        await this.subIntention('go_to', { x, y });
        await client.pickup()
    }

}
/*
class BlindMove extends Plan {

    isApplicableTo ( desire ) {
        return desire == 'go_to';
    }

    async execute ( {x, y} ) {        
        while ( me.x != x || me.y != y ) {

            let status_x = undefined;
            let status_y = undefined;
            
            console.log('me', me, 'xy', x, y);

            if ( x > me.x )
                status_x = await client.move('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( x < me.x )
                status_x = await client.move('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if ( y > me.y )
                status_y = await client.move('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( y < me.y )
                status_y = await client.move('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                console.log('stucked')
                break;
            } else if ( me.x == x && me.y == y ) {
                console.log('target reached')
            }
            
        }

    }
}*/

class BlindMove extends Plan {

    isApplicableTo(desire) {
        return desire == 'go_to';
    }

    async execute({ x, y }) {
        console.log("starting movement to:xy", x, y);
        let path = pathfind([me.x, me.y], [x, y])
        while (me.x != x || me.y != y) {
            let step_counter = 1;
            console.log("step_conter", step_counter)
            let status_x = undefined;
            let status_y = undefined;

            console.log('me', me, 'xy', x, y);

            if (path[step_counter][0] > me.x)
                status_x = await client.move('right')
            //console.log("right",path[step_counter], me)}
            // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );

            else if (path[step_counter][0] < me.x)
                status_x = await client.move('left')
            //console.log('left',path[step_counter], me)}
            // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );


            else if (path[step_counter][1] > me.y)
                status_y = await client.move('up')
            //console.log('up',path[step_counter], me)}
            // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if (path[step_counter][1] < me.y)
                status_y = await client.move('down')
            //console.log('down',path[step_counter], me)}
            // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

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


plans.push(new GoPickUp())
plans.push(new BlindMove())



const myAgent = new Agent()
myAgent.intentionLoop()
// client.onYou( () => myAgent.queue( 'go_to', {x:11, y:6} ) )

client.onParcelsSensing(parcels => {
    for (const { x, y, carriedBy } of parcels) {
        if (!carriedBy)
            myAgent.queue('go_pick_up', { x, y });
    }
})