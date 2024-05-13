import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
import{Utilities as ut } from "./Utilities.js"

const logs = true;
/* 
    Da aggingere la parte di aggiornamento delle opzioni,
    aggiungere i posti di default,
  */
const client = new DeliverooApi(
    //'http://localhost:8080',
    'https://deliveroojs2.onrender.com/?name=bitdelivery',
    '',
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
        if (value !== undefined && value > maxValue/2) {
            resultList.push({ x, y, value,time:start-max_time});
        }
    }
    resultList.sort((a, b) =>  b.value - a.value);
    return resultList;
}

function distance_manhattan(a,b) {
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(b.y))
    return dx + dy;
}

function distance_path(a, b) {
    let path = pathfind(a, b);
    if (path == null)
        return null;
    else return path.length;
}


function get_nearest_delivery_point_path(a) {
    let min = Number.MAX_VALUE;
    let nearest_point = null;
    let distance = null;
    for (let delivery_point of map.delivery_tiles) {
        distance = distance_path(a, delivery_point);
        if (distance == null) continue;
        if (distance < min){
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

function pathfind(start_pos, end_pos) {
    let grid = ut.generategrid(map, beliefSet_agents.values())
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
    if(config.PARCEL_DECADING_INTERVAL =="infinite") decay_time = 0;
    else decay_time= parseInt(config.PARCEL_DECADING_INTERVAL.match(/\d+(\.\d+)?/)[0])*1000;
    //if(logs) console.log(config.MOVEMENT_DURATION);
})

function delete_put_down(){
    const idsToDelete = [];
    for (const p of beliefSet_parcels.values()) {
        if (p.carriedBy == me.id){
            idsToDelete.push(p.id);
        }
    }
    for (const id of idsToDelete) {
        beliefSet_parcels.delete(id);
    }
}

function delete_parcels_here(){
    const idsToDelete = [];
    for (const p of beliefSet_parcels.values()) {
        if ((p.carriedBy!=me.id)&&(p.x==me.x)&&(p.y==me.y)){
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
    //yellowAndWhite: '\x1b[33;47m'
};
const resetColor = '\x1b[0m';






const map = {};
var max_time = 1000;
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
    max_time = map.width*map.height*config.MOVEMENT_DURATION/10;
    if(max_time<3000) max_time=3000;
    map.favorite_coordinates = generate_favorite_coordinates();
    if(logs) console.log(map.favorite_coordinates);
})


/**
 * Beliefset revision function
 */
const me = {};
client.onYou(({ id, name, x, y, score }) => {
    //if(logs) console.log(colors.yellow + "[onYou]" +resetColor+ "receiving new position");
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
})




client.onAgentsSensing( (agents) => { //intanto no memoria sugli agenti
    if ((agents != undefined)&&(agents.length!=0)) {
        if(logs) console.log(colors.yellow + "[onAgents]" +resetColor+ "agent_sensing");
        beliefSet_agents = new Map();
        //time = Date.now() - start;
        for (let a of agents) {
            /*
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
                if (!old_a.viewable) if(logs) console.log("here we go again:" + a.name)
            }*/

            beliefSet_agents.set(a.id, a);


            //update on all beliefs
            /*
            for (const [key, a] of beliefSet_agents) {
                //viewable
                (distance_manhattan(me, a) > config.AGENTS_OBSERVATION_DISTANCE) ? a.viewable = false : a.viewable = true
                if (!a.viewable & Date.now() - a.time > 100) a.action = "lost"
                beliefSet_agents.set(a.id, a);
            }*/
        }
        let printBelief = Array.from(beliefSet_agents.values()).map(({ id, name, x, y}) => {
            return `${name}:${x},${y}\n`;
        }).join(' ');
        if(logs) console.log(colors.yellow + "[onAgents]" +resetColor+ "memory agents:\n" + printBelief);
        option_generation(1);
    }
})


/**
 * Options generation and filtering function
 */
client.onParcelsSensing( parcels => {
    if ((parcels != undefined)&&(parcels.length!=0)){
        //if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "parcels_sensing");
        time = Date.now() - start;

        for (let p of parcels){
            if((!p.carriedBy)||p.carriedBy==me.id){
                p.time = time;
                beliefSet_parcels.set(p.id, p);
            }
            //compute direction
            /*if ((!beliefSet_parcels.has(p.id))&&(!p.carriedBy)){
                //p.viewable = true
                beliefSet_parcels.set(p.id, p);
            }
            else if(p.carriedBy == me.id){
                let el=beliefSet_parcels.get(p.id);
                el.carriedBy = p.carriedBy;
                beliefSet_parcels.set(p.id,el);
            }*/
        }
        const idsToDelete = [];
        for(const p of beliefSet_parcels.values()){
            if(p.reward<2){
                if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "delete parcel memory (expired nearby):", p);
                idsToDelete.push(p.id);
            }
            else if((p.carriedBy)&&(p.carriedBy !== me.id)){
                if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "delete parcel memory (carried):", p);
                idsToDelete.push(p.id);
            }
            else if(!parcels.some(parcel => parcel.id === p.id)){
                if(distance_manhattan(me,p)<=config.PARCELS_OBSERVATION_DISTANCE){
                    if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "delete parcel memory (lost track):", p);
                    idsToDelete.push(p.id);
                }
                else if(Date.now() - p.time > decay_time) {
                    p.reward -= Math.floor((Date.now()-p.time)/decay_time);
                    if(p.reward > 2){
                        p.time = Date.now();
                        beliefSet_parcels.set(p.id, p);
                    }
                    else{
                        if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "delete parcel memory (expired somewhere):", p);
                        idsToDelete.push(p.id);
                    }
                }
            }
        }
        for (const id of idsToDelete) {
            beliefSet_parcels.delete(id);
        }
        let printBelief = Array.from(beliefSet_parcels.values()).map(({ id, x, y, reward, time, carriedBy }) => {
            return `${id}:${x},${y},${reward},${time},${carriedBy}\n`;
        }).join(' ');
        if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "parcel_memory:\n" + printBelief);
        option_generation(2);
    }
})

function option_generation(x){             //??? migliorare percorsi
    if(logs){
        if(x==1){
            console.log(colors.blue + "[opt_gen]" +resetColor+ "agents call");
        }
        else if(x==2){
            console.log(colors.blue + "[opt_gen]" +resetColor+ "parcels call");
        }
        else if(x==3){
            console.log(colors.blue + "[opt_gen]" +resetColor+ "main loop call");
        }
    }
    /**
 * Options generation
 */
    const options = [];
    /*let delivery = false;
    let delivery_priority=0;*/
    let nearest_delivery_point;
    let parcels_on_me_counter = 0;
    let parcels_on_me_reward = 0;
    for (const parcel of beliefSet_parcels.values()){
        if(parcel.carriedBy == me.id){
            parcels_on_me_reward += parcel.reward;
            parcels_on_me_counter += 1;
        }
    }
    for (const parcel of beliefSet_parcels.values()){
        if (parcel.carriedBy == me.id){
            continue;
        }
        if (!parcel.carriedBy){
            let distance_percel = distance_path(me, parcel);
            if (!distance_percel){
                if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find path to", parcel);
                continue;
            }
            nearest_delivery_point = get_nearest_delivery_point_path(parcel);
            if (!nearest_delivery_point){
                if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find nearest delivery point to", parcel);
                continue;
            }
            if(decay_time){
                var priority = parcel.reward + parcels_on_me_reward - ((distance_percel+nearest_delivery_point.distance)*(parcels_on_me_counter+1))/(4*decay_time);
            }
            else{
                var priority = parcel.reward + parcels_on_me_reward - 2* parcels_on_me_counter;
            }
            options.push(['go_pick_up', priority, parcel.x, parcel.y]);

            if(parcels_on_me_counter){ //second option
                let distance_delivery = distance_path(me, nearest_delivery_point);
                if(!distance_delivery){
                    if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find path to delivery");
                    continue;
                }
                priority = parcels_on_me_reward + parcel.reward - ((parcels_on_me_counter+1)*distance_delivery+nearest_delivery_point.distance*2)/(4*decay_time);
                options.push(['go_deliver', priority, nearest_delivery_point.x, nearest_delivery_point.y]);
            }
        }
        /*else if (parcel.carriedBy == me.id){
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "im carring at least a parcel");
            if(!delivery){
                nearest_delivery_point_delivery = get_nearest_delivery_point_path(me);
                if (!nearest_delivery_point_delivery){
                    if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find nearest delivery point to", parcel);
                    continue;
                }
                let distance = distance_path(parcel,nearest_delivery_point_delivery);
                //if (!distance) continue;
                delivery_priority = parcel.reward - distance;
                delivery = true;
            }
            else{
                delivery_priority += parcel.reward;
            }
        }*/
        else{
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "something enexpected happend while generating options");
            while(1); //to remove
        }
    }
    if(parcels_on_me_counter){
        nearest_delivery_point = get_nearest_delivery_point_path(me);
        if (!nearest_delivery_point){
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find nearest delivery point to", parcel);
        }
        else{
            let distance = nearest_delivery_point.distance;//distance_path(me, nearest_delivery_point_delivery);
            if(decay_time){
                var priority = parcels_on_me_reward - (parcels_on_me_counter*distance)/(4*decay_time);
            }
            else{
                var priority = parcels_on_me_reward;
            }
            options.push(['go_deliver', priority, nearest_delivery_point.x, nearest_delivery_point.y]);
        }
    }
    /*if (delivery) {
        options.push(['go_deliver', delivery_priority, nearest_delivery_point_delivery.x, nearest_delivery_point_delivery.y]);
    }*/

    /**
     * Options filtering
     */
    let best_option;
    if(map.favorite_coordinates){
        if (options.length==0){
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "no option");
            //let time = config.MOVEMENT_DURATION*map.favorite_coordinates.length;
            for(let position of map.favorite_coordinates){
                if(distance_manhattan(me,position)>10){
                    continue;
                }
                if(me.x==position.x&& me.y == position.y){
                    position.time = Date.now();
                }
                //if(logs) console.log(position, Date.now()-position.time,config.MOVEMENT_DURATION)
                if(Date.now()-position.time>max_time){
                    let distance = distance_path(me,position);
                    //if(logs) console.log("##########################",me,position,distance)
                    if(distance){
                        options.push(["go_to",position.value-distance,position.x,position.y]);
                    }
                }
            }
        }
        /*if (options.length ==0){
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "No option");
            while(1);
            let position = map.favorite_coordinates[0];
            let distance = distance_manhattan(me,position);
            options.push(["go_to",position.value-distance,position.x,position.y]);
        }*/
        

        //if(logs) console.log("OPTIONS",options)
        let max_priority = Number.MIN_SAFE_INTEGER;
        for (const option of options) {
            if (option[1] > max_priority) {
                max_priority = option[1];
                best_option = option;
            }
        }
    }

    /**
     * Best option is selected
     */
    if (best_option){
        myAgent.push(best_option);
    }
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
        let loop_counter=0;
        while (true) {
            if(logs) console.log(colors.red + "[main_loop]" +resetColor+ "==================================================================>",loop_counter++);
            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                try {
                    if(logs) console.log(colors.red + "[main_loop]" +resetColor+ 'intentionRevision.loop', this.intention_queue.map(i => i.predicate));

                } catch (error) {
                    if(logs) console.log(error)
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
                await intention.achieve()
                // Catch eventual error and continue
                .catch(error => {
                    if(logs) console.log( colors.red + "[main_loop]" +resetColor+ 'Failed intention', ...intention.predicate, 'with error:', error )
                });

                // Remove from the queue
                this.intention_queue.shift();
            }else{
                option_generation(3);
            }
            // Postpone next iteration at setImmediate
            await new Promise(res => setImmediate(res));
        }
    }

    // async push ( predicate ) { }

    log(...args) {
        if(logs) console.log(...args)
    }

}

class IntentionRevisionReplace extends IntentionRevision {

    async push(predicate) {// the predicate is the same as desire or predicate

        // Check if already queued
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        //if (last && last.predicate.join(' ') == predicate.join(' ')) {
        if(last){
            if(logs) console.log("[Intentions]---check-if-replace------>",last.predicate,"----with----",predicate);
            /*for(let i=0; i<=1000000000;i++){
            }*/
            if((last.predicate[0]==predicate[0])&&(last.predicate[2]==predicate[2])&&(last.predicate[3]==predicate[3])){
                last.predicate[1]=predicate[1];
                return;
            }
            else if (last.predicate[1] > predicate[1]) {
                return; // intention is already being achieved
            }
        }
        else{
            if(logs) console.log("[Intentions] ---> no last in the queue");
        }

        if(logs) console.log('[Intentions] ---> IntentionRevisionReplace.push', predicate);
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
        if(logs) console.log(...args)
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
            if (this.stopped) throw ['[achive intent]stopped intention', ...this.predicate];

            // if plan is 'statically' applicable
            if (planClass.isApplicableTo(this.predicate[0])) {
                // plan is instantiated
                this.#current_plan = new planClass(this.#parent);
                this.log('[achive intent]achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log('[achive intent]succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log('[achive intent]failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
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
            if(logs) console.log(...args)
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

    static isApplicableTo(intention){
        return intention == 'go_pick_up';
    }

    async execute(desire, priority, x, y){
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

class GoTo extends Plan {

    static isApplicableTo(intention) {
        return intention == 'go_to';
    }

    async execute(intention, priority, x, y){
        if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> starting movement to ->", x, y);
        let path = pathfind(me, { x: x, y: y });
        //console.log(path)
        if(path == null){
            if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> path null");
            throw ['failed (no path found)'];
        }
        let step_counter = 1;
        //let grid = ut.generategrid(map, beliefSet_agents.values())
        //if(logs) console.log(ut.printGridSEPath(grid,me,{ x: x, y: y },path))
        let counter=0;
        while(me.x != x || me.y != y){
            let last_action = null //to_remove
            if (this.stopped) {
                if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> execute STOPPED");
                throw ['stopped'];
            }

            let me_tmp = { x: me.x, y: me.y };
            if(path[step_counter][0] < me.x){
                last_action = "left";
                await client.move('left');
            }
            else if (path[step_counter][0] > me.x){
                last_action = "right";
                await client.move('right');
            }
            else if (path[step_counter][1] > me.y){
                last_action = "up";
                await client.move('up');
            }
            else if (path[step_counter][1] < me.y){
                last_action = "down";
                await client.move('down');
            }
            if((me.x==me_tmp.x)&&(me.y==me_tmp.y)&&(counter<3)){
                if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> retrying");
                counter++;
                continue;
            }
            else if(counter==3){
                if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> execute STUCKED");
                throw [colors.green + "[plan]" +resetColor+ 'stucked'];
            }
            else{
                me.x = path[step_counter][0];
                me.y = path[step_counter][1];
                step_counter += 1;
            }
            if(logs) console.log(colors.green + "[plan]" +resetColor+ intention,x,y,step_counter,path[step_counter-1],last_action);
        }
        console.log(colors.green + "[plan]" +resetColor+ '-> target reached')
        return "success";
    }
}


// plan classes are added to plan library 
planLibrary.push(GoPickUp);
planLibrary.push(GoTo);
planLibrary.push(Deliver);
