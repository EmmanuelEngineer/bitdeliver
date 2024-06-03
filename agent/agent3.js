import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder_2.mjs';
import{Utilities as ut } from "./Utilities.js"
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";

const logs = false;
const save_pddl = false; //in ./tmp


//???? to arrange
const coop=false;
const partner=0;


const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAzYmZhOTY0MjU4IiwibmFtZSI6IlRyZXR0ZWwiLCJpYXQiOjE3MTM5NDkzMDN9.E-R5IWduQfdGcHRexApoXYAziuWiuhZ1la7jmJ9l8m8'
)
//???-migliorare maxValue
//generate a list of the most attractive tiles
function generate_favorite_coordinates() {
    const temporaryGridMap = Array.from({ length: map.width }, () => Array(map.height).fill(0));
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let tile of map.spawnable_tiles) {
        const { x, y } = tile;
        temporaryGridMap[x][y] += 1;
        for (let i = x - 3; i <= x + 3; i++) {
            for (let j = y - 3; j <= y + 3; j++) {
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
            resultList.push({ x, y, value, time: start - max_time });
        }
    }
    resultList.sort((a, b) => b.value - a.value);
    return resultList;
}


function distance_manhattan(a,b) {
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(b.y))
    return dx + dy;
}

//compute path.length
function distance_path(a, b) {
    let path = pathfind(a, b);
    if (path == null)
        return null;
    else return path.length;
}

//compute the shortest path to a delivery point
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

//find path
function pathfind(start_pos, end_pos) {
    let grid = ut.generategrid(map, beliefSet_agents.values())
    //console.log(start_pos,end_pos)
    //if(logs) console.log(ut.printGridSE(grid,start_pos,end_pos))
    let start = new Node(Math.round(start_pos.x), Math.round(start_pos.y), 0, 0);
    let end = new Node(Math.round(end_pos.x), Math.round(end_pos.y), 0, 0);
    let path = Pathfinder.aStar(grid, start, end);

    //if(logs) console.log("Shortest Path:", path);
    return path;
}

//global variables
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

function init_myMapBeliefset(){
    for (let x = 0; x < grid.length; x++){
        for (let y = 0; y < grid[0].length; y++){
            if(grid[x][y] == 0){
                if(x+1 < grid.length && grid[x+1][y] == 0){
                    myMapBeliefset.push(`near p${x}_${y} p${x+1}_${y}`);
                    myMapBeliefset.push(`near p${x+1}_${y} p${x}_${y}`);
                }
                if(y+1 < grid[0].length && grid[x][y+1] == 0){
                    myMapBeliefset.push(`near p${x}_${y} p${x}_${y+1}`);
                    myMapBeliefset.push(`near p${x}_${y+1} p${x}_${y}`);
                }
            }
        }
    }
}

function init_domains(){
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
    
    
    let pddlDomain = new PddlDomain( 'bitdelivery-world');
    pddlDomain.addAction(move);
    pddlDomain.addAction(grab);
    pddlDomain.addAction(drop);
    pddlDomain.predicates = [];
    pddlDomain.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain.addPredicate("on ?x - agent ?pos - position");
    pddlDomain.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain.addPredicate("near ?pos1 ?pos2 - position");
    if(save_pddl){
        pddlDomain.saveToFile();
    }
    domain = pddlDomain.toPddlString();

    let pddlDomain_coop = new PddlDomain( 'bitdelivery-world_coop');
    pddlDomain_coop.addAction(move_coop);
    pddlDomain_coop.addAction(grab);
    pddlDomain_coop.addAction(drop);
    pddlDomain_coop.predicates = [];
    pddlDomain_coop.addPredicate("holding ?ag - agent ?ob - package");
    pddlDomain_coop.addPredicate("on ?x - agent ?pos - position");
    pddlDomain_coop.addPredicate("on_pkg ?x - package ?pos - position");
    pddlDomain_coop.addPredicate("near ?pos1 ?pos2 - position");
    pddlDomain_coop.addPredicate("different ?ag1 ?ag2 - agent");
    if(save_pddl){
        pddlDomain_coop.saveToFile();
    }
    domain_coop = pddlDomain_coop.toPddlString();
}


const colors = {
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    //yellowAndWhite: '\x1b[33;47m'
};
const resetColor = '\x1b[0m';

let domain; //??aggiunto domains single and coop
let domain_coop;
init_domains();
const myMapBeliefset = []; //??aggiunto questo e grid +funz init emodifiche onMap
let grid = {};
const map = {};
let max_time = 1000;

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

    //if(logs) console.log("CARATTERISTICHE MAPPA", width, height, tiles);
    max_time = map.width*map.height*config.MOVEMENT_DURATION/10;
    if(max_time<7000) max_time=7000;
    map.favorite_coordinates = generate_favorite_coordinates();
    if(logs) console.log(map.favorite_coordinates);
    init_myMapBeliefset();
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
    updateAgentsBelief(agents);
})

function updateAgentsBelief(agents){
    if(logs) console.log(colors.yellow + "[onAgents]" +resetColor+ "agent_sensing");
    //beliefSet_agents = new Map();
    for (let a of agents) {
        beliefSet_agents.set(a.id, a);
    }
    let printBelief = Array.from(beliefSet_agents.values()).map(({ id, name, x, y}) => {
        return `${name}:${x},${y}\n`;
    }).join(' ');
    if(logs) console.log(colors.yellow + "[onAgents]" +resetColor+ "memory agents:\n" + printBelief);
    option_generation(1);
}


/**
 * Options generation and filtering function
 */
client.onParcelsSensing( parcels => {
    updateParcelsBelief(parcels);
})

function updateParcelsBelief(parcels){
    //if(logs) console.log(colors.yellow + "[onParcels]" +resetColor+ "parcels_sensing");
    time = Date.now() - start;

    for (let p of parcels){
        if((!p.carriedBy)||p.carriedBy==me.id){
            p.time = time;
            beliefSet_parcels.set(p.id, p);
        }
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
            if (!nearest_delivery_point){ //???? warning -> coop doesn't works with this
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
        else{
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "something enexpected happend while generating options");
            while(1); //to remove
        }
    }
    if(parcels_on_me_counter){
        nearest_delivery_point = get_nearest_delivery_point_path(me);
        if (!nearest_delivery_point){
            if(logs) console.log(colors.blue + "[opt_gen]" +resetColor+ "unable to find nearest delivery point to", me);
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
                if(distance_manhattan(me,position)>20){
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
                        options.push(["go_to",position.value-distance-100,position.x,position.y]); //?? -100-> priorità go_to < tutti altri casi (per coop)
                    }
                }
            }
        }
        let max_priority = Number.MIN_SAFE_INTEGER;
        for (const option of options) {
            if (option[1] > max_priority){
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
    #lastParcelSensingTime = Date.now();
    #lastAgentSensingTime = Date.now();

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
                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch(error => {
                    if(logs) console.log( colors.red + "[main_loop]" +resetColor+ 'Failed intention', ...intention.predicate, 'with error:', error )
                });

                // Remove from the queue
                this.intention_queue.shift();
            }else{
                if(map.favorite_coordinates){
                    for (let coordinates of map.favorite_coordinates){
                        if(distance_manhattan(me, coordinates) <= config.PARCELS_OBSERVATION_DISTANCE){
                            coordinates.time = Date.now();
                        }
                    }
                }
                option_generation(3);
            }

            let current_intention = this.intention_queue[0];
            if(current_intention && map.favorite_coordinates){
                for (let coordinates of map.favorite_coordinates) {
                    if(!(current_intention.predicate[0]=="go_to"&& current_intention.predicate[2]== coordinates.x&& current_intention.predicate[3]==coordinates.y)){
                        if (distance_manhattan(me, coordinates) <= config.PARCELS_OBSERVATION_DISTANCE){
                            coordinates.time = Date.now();
                        }
                    }
                }
            }

            if (Date.now() - this.#lastParcelSensingTime > 4000) {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'Generating empty parcelsensing event');
                updateParcelsBelief([]);
                this.#lastParcelSensingTime = Date.now();
            }

            if (Date.now() - this.#lastAgentSensingTime > 4000) {
                if (logs) console.log(colors.red + "[main_loop]" + resetColor + 'Generating empty agentsensing event');
                updateAgentsBelief([]);
                this.#lastAgentSensingTime = Date.now();
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

        for (const planClass of planLibrary) {
            if (this.stopped) throw ['[achive intent]stopped intention', ...this.predicate];
            if (planClass.isApplicableTo(this.predicate[0])) {
                this.#current_plan = new Plan(this.#parent);
                this.log('\n[achive intent]achieving intention', ...this.predicate, 'with plan', planClass.name);
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log('\n[achive intent]succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log('\n[achive intent]failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
                }
            }
        }
        // if stopped then quit
        if (this.stopped) throw ['[achive intent]stopped intention', ...this.predicate];

        // no plans have been found to satisfy the intention

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
}


class Plan_single extends Plan{

    static isApplicableTo(intention){
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_delivery');
    }

    async execute(intention, priority, x, y){
        let plan = generate_plan(intention,x,y,0);
        if (this.stopped) throw ['stopped'];
        if (!plan || plan.length === 0) {
            if(logs) console.log(colors.green + "[plan]" +resetColor+ "plan not found" + resetColor);
            throw ['failed (no plan found)'];
        }
        else {
            if(logs) console.log(colors.green + "[plan]" +resetColor+ "plan found");
            //if(!coop){
            for (let step of plan){
                if (this.stopped) throw ['stopped'];
                let action = step.action;
                if (action == "MOVE"){
                    let [ag, from, to] = step.args;
                    if(logs) console.log(colors.green + "[plan]" +resetColor+ " starting moving to", to);
                    const regex = /P(\d+)_(\d+)/;
                    const match = to.match(regex);
                    if (match) {
                        var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10)};
                    }
                    else {
                        throw new Error(`Invalid position format: ${position}`);
                    }
                    let counter=0;
                    while(me.x != x || me.y != y){
                        let last_action = null
                        if (this.stopped) {
                            if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> execute STOPPED");
                            throw ['stopped'];
                        }
                        let me_tmp = { x: me.x, y: me.y };
                        if(x < me.x){
                            last_action = "left";
                            await client.move('left');
                        }
                        else if (x > me.x){
                            last_action = "right";
                            await client.move('right');
                        }
                        else if (y > me.y){
                            last_action = "up";
                            await client.move('up');
                        }
                        else if (y < me.y){
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
                            me.x = x;
                            me.y = y;
                        }
                        if(logs) console.log(colors.green + "[plan]" +resetColor+ intention,x,y,last_action);
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    await client.pickup();
                    if(logs) console.log(colors.green + "[plan]" +resetColor +`${ag} grab ${ob} in ${pos}`);
                } else if (action == "DROP") {
                    let [ag, ob, pos] = step.args;
                    await client.putdown();
                    delete_put_down();
                    if(logs) console.log(colors.green + "[plan]" +resetColor+ `${ag} drop ${ob} in ${pos}`);
                }
            }
            return "success";
        }
    }
}



class Plan_coop extends Plan{

    static isApplicableTo(intention){
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_delivery'); //???? non so cosa ci va
    }
    async execute(intention, priority, x, y){
        let plan = generate_plan(intention,x,y,1);
        if (this.stopped) throw ['stopped']; //???? send the 'stap waiting' message
        if (!plan || plan.length === 0) {
            if(logs) console.log(colors.green + "[plan]" +resetColor+ "plan not found" + resetColor);
            throw ['failed (no plan found)'];
        }
        else {
            for (let step of plan){
                if (this.stopped) throw ['stopped']; //???? send the 'stap waiting' message
                let action = step.action;
                if (action == "MOVE_COOP") {
                    let [ag, ag2, from, to] = step.args;
                    if(ag == "PARTNER"){
                        //send(partner step); //???? send the instruction and wait
                        //wait partner completition of the action
                    }
                    else{
                        if(logs) console.log(colors.green + "[plan]" +resetColor+ " starting moving to", to);
                        const regex = /P(\d+)_(\d+)/;
                        const match = to.match(regex);
                        if (match) {
                            var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10)};
                        }
                        else {
                            throw new Error(`Invalid position format: ${position}`);
                        }
                        let counter=0;
                        while(me.x != x || me.y != y){
                            let last_action = null
                            if (this.stopped) {
                                if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> execute STOPPED");
                                //???? send the 'stap waiting' message
                                throw ['stopped'];
                            }
                            let me_tmp = { x: me.x, y: me.y };
                            if(x < me.x){
                                last_action = "left";
                                await client.move('left');
                            }
                            else if (x > me.x){
                                last_action = "right";
                                await client.move('right');
                            }
                            else if (y > me.y){
                                last_action = "up";
                                await client.move('up');
                            }
                            else if (y < me.y){
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
                                me.x = x;
                                me.y = y;
                            }
                            if(logs) console.log(colors.green + "[plan]" +resetColor+ intention,x,y,last_action);
                        }
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    if(ag == "PARTNER"){
                        //send(partner step); //???? send the instruction and wait
                        //wait partner completition of the action
                    }
                    else{
                        await client.pickup();
                        if(logs) console.log(colors.green + "[plan]" +resetColor +`${ag} grab ${ob} in ${pos}`);
                    }
                
            
                } else if (action == "DROP") {
                    let [ag, ob, pos] = step.args;
                    if(ag == "PARTNER"){
                        //send(partner step); //???? send the instruction and wait
                        //wait partner completition of the action
                    }
                    else{
                        await client.putdown();
                        delete_put_down();
                        if(logs) console.log(colors.green + "[plan]" +resetColor+ `${ag} drop ${ob} in ${pos}`);
                    }
                }
            }
            //send(partner plan_terminated); //???? send the 'stap waiting' message
            return "success";
        }
    }
}

class Plan_receiver extends Plan{
    async execute(){ //???? adattala come vuoi
        while(!plan_terminated){  //???? set to receive the terminal message
            let step //= wait_instruction //????
            let action = step.action;
            if (action == "MOVE"){
                let [ag, ag2, from, to] = step.args;
                if(logs) console.log(colors.green + "[plan]" +resetColor+ " starting moving to", to);
                const regex = /P(\d+)_(\d+)/;
                const match = to.match(regex);
                if (match) {
                    var { x, y } = { x: parseInt(match[1], 10), y: parseInt(match[2], 10)};
                }
                else {
                    throw new Error(`Invalid position format: ${position}`);  //???? come gestiamo gli errori? (send(fail) or something else)
                }
                let counter=0;
                while(me.x != x || me.y != y){
                    let last_action = null
                    let me_tmp = { x: me.x, y: me.y };
                    if(x < me.x){
                        last_action = "left";
                        await client.move('left');
                    }
                    else if (x > me.x){
                        last_action = "right";
                        await client.move('right');
                    }
                    else if (y > me.y){
                        last_action = "up";
                        await client.move('up');
                    }
                    else if (y < me.y){
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
                        me.x = x;
                        me.y = y;
                    }
                    if(logs) console.log(colors.green + "[plan]" +resetColor+ intention,x,y,last_action);
                }
            } else if (action == "GRAB") {
                let [ag, ob, pos] = step.args;
                await client.pickup();
                if(logs) console.log(colors.green + "[plan]" +resetColor +`${ag} grab ${ob} in ${pos}`);
            } else if (action == "DROP") {
                let [ag, ob, pos] = step.args;
                await client.putdown();
                delete_put_down();
                if(logs) console.log(colors.green + "[plan]" +resetColor+ `${ag} drop ${ob} in ${pos}`);
            }
        }
        return "success";
    }
}

class Plan_random_move extends Plan{//????
    //...
}


// plan classes are added to plan library 
planLibrary.push(Plan_single);
planLibrary.push(Plan_coop);
planLibrary.push(Plan_receiver);
//planLibrary.push(Plan_random_move);









async function generate_plan(intention,x,y,coop){ //???? riposizionare al termine
    const myBeliefset = new Beliefset();
    for(let ob of myMapBeliefset){
        myBeliefset.declare(ob);
    }
    let goal = '';
    if (this.stopped) throw ['stopped'];
    for(const agent_obj of beliefSet_agents){
        const agent = agent_obj[1];
        agent.x = Math.round(agent.x);
        agent.y = Math.round(agent.y);
        if(coop && (agent.id == partner.id)){
            continue;
        }
        if(agent.x-1>=0){
            if(grid[agent.x-1][agent.y] == 0){ //taglio solo il "ponte" di andata
                myBeliefset.undeclare(`near p${agent.x-1}_${agent.y} p${agent.x}_${agent.y}`);
            }
        }
        if(agent.x+1<grid.length){
            if(grid[agent.x+1][agent.y] == 0){ 
                myBeliefset.undeclare(`near p${agent.x+1}_${agent.y} p${agent.x}_${agent.y}`);
            }
        }
        if(agent.y-1>=0){
            if(grid[agent.x][agent.y-1] == 0){ 
                myBeliefset.undeclare(`near p${agent.x}_${agent.y-1} p${agent.x}_${agent.y}`);
            }
        }
        if(agent.y+1<grid[0].length){
            if(grid[agent.x][agent.y+1] == 0){ 
                myBeliefset.undeclare(`near p${agent.x}_${agent.y+1} p${agent.x}_${agent.y}`);
            }
        }
    }
    myBeliefset.declare(`on me p${me.x}_${me.y}`);
    if(!coop){
        if(intention == 'go_pick_up'){
            myBeliefset.declare(`on_pkg target p${x}_${y}`);
            goal = `holding me target`;
        }
        else if(intention == 'go_deliver'){
            myBeliefset.declare(`holding me target`);
            goal = `on_pkg target p${x}_${y}`;
        }
        else if(intention == 'go_to'){
            goal = `on me p${x}_${y}`;
        }
    }
    else{
        myBeliefset.declare(`on partner p${me.x}_${me.y}`);
        myBeliefset.declare(`different partner me`);
        myBeliefset.declare(`different me partner`);
        if(intention == 'go_deliver'){
            myBeliefset.declare(`holding partner target`); //????to define who has the package (me or partner)
            goal = `on_pkg target p${x}_${y}`;
        }
        else{
            if(logs) console.log(colors.green + "[plan]" +resetColor+ "coop mode with unknown intention");
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
    if(coop){
        objectsStr = objectsStr.replace(' partner', '');
        objectsStr = objectsStr + ' me partner - agent';
    }
    else{
        objectsStr = objectsStr + ' me - agent';
    }
    let pddlProblem = new PddlProblem(
        'bitdelivery-prob',
        objectsStr,
        myBeliefset.toPddlString(),
        goal
    )
    if(save_pddl) pddlProblem.saveToFile();
    let problem = pddlProblem.toPddlString();

    if (this.stopped) throw ['stopped'];
    let plan;
    if(!coop){
        plan = await onlineSolver(domain, problem);
    }
    else{
        plan = await onlineSolver(domain_coop, problem);
    }
    return plan;
}