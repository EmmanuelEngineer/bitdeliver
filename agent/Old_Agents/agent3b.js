import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder_2.mjs';
import { onlineSolver, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";

import fs from 'fs';
const path = './tmp';

const logs = true;
const save_pddl = false; //in ./tmp

if(save_pddl){
    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
}


//???? to arrange
const coop=false;
const partner=0;


const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAzYmZhOTY0MjU4IiwibmFtZSI6IlRyZXR0ZWwiLCJpYXQiOjE3MTM5NDkzMDN9.E-R5IWduQfdGcHRexApoXYAziuWiuhZ1la7jmJ9l8m8'
)

//---------------------------------------------------------------------------------------------------
//support functions

//generate a list of the most attractive tiles
function generate_favorite_coordinates(){           //ok
    const temporaryGridMap = Array.from({ length: map.width }, () => Array(map.height).fill(0));
    const distance = 4;
    let maxValue = -1;
    for (let tile of map.spawnable_tiles){
        const { x, y } = tile;
        temporaryGridMap[x][y] += 1;  //to at least set maxValue to 2
        for (let i = x-distance; i <= x + distance; i++){
            const deltaY = distance - Math.abs(i - x);
            for (let j = y - deltaY; j <= y + deltaY; j++) {
                if ((i >= 0) && (i < map.width) && (j >= 0) && (j < map.height)){
                    temporaryGridMap[i][j] += 1;
                    if (temporaryGridMap[i][j] > maxValue){
                        maxValue = temporaryGridMap[i][j];
                    }
                }
            }
        }
    }
    const resultList = [];
    for (let tile of map.spawnable_tiles){
        const { x, y } = tile;
        const value = temporaryGridMap[x][y];
        if (value > maxValue / 2) { //to reduce the list a bit
            resultList.push({ x, y, value, time: start});
        }
    }
    resultList.sort((a, b) => b.value - a.value);
    return resultList;
}


function distance_manhattan(a,b){                   //ok
    const dx = Math.abs(Math.round(a.x) - Math.round(b.x))
    const dy = Math.abs(Math.round(a.y) - Math.round(b.y))
    return dx + dy;
}


//find path
function distance_path(start_pos, end_pos){         //ok ???correction for coop
    if(!grid){
        return null;
    }
    let grid_copy = grid.map(row => [...row]);
    for (let agent of beliefSet_agents.values()){
        if(agent != undefined){
            grid_copy[Math.round(agent.x)][Math.round(agent.y)] = 1;
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
function get_nearest_delivery_path(a){        //ok
    let min = Number.MAX_VALUE;
    let nearest_point = null;
    let distance = null;
    for (let delivery_point of map.delivery_tiles){
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


function delete_put_down(){                         //??? to_check
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

//init PDDL assumptions
function init_myMapBeliefset(){                     //ok
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


function init_domains(){                            //ok
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

//---------------------------------------------------------------------------------------------------
//main program begin

//colors for the logs
const colors = {                        //planner POST (white)
    yellow: '\x1b[33m',                 //events
    blue: '\x1b[34m',                   //option generator
    red: '\x1b[31m',                    //main loop
    green: '\x1b[32m',                  //planner
    pink: '\x1b[35m'                    //intentions
    //yellowAndWhite: '\x1b[33;47m'
};
const resetColor = '\x1b[0m';

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
    if(logs) console.log(colors.yellow + "[onConfig] " +resetColor+  "receiving parameters", config_input);
    config.AGENTS_OBSERVATION_DISTANCE = config_input.AGENTS_OBSERVATION_DISTANCE;
    config.PARCELS_OBSERVATION_DISTANCE = config_input.PARCELS_OBSERVATION_DISTANCE;
    config.PARCEL_DECADING_INTERVAL = config_input.PARCEL_DECADING_INTERVAL;
    config.MOVEMENT_DURATION = config_input.MOVEMENT_DURATION
    if(config.PARCEL_DECADING_INTERVAL =="infinite") decay_time = 0;
    else decay_time= parseInt(config.PARCEL_DECADING_INTERVAL.match(/\d+(\.\d+)?/)[0])*1000;
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

client.onMap((width, height, tiles) => {
    if(logs) console.log(colors.yellow + "[onMap] " +resetColor+ " receiving map");
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

    map.favorite_coordinates = generate_favorite_coordinates();
    //if(logs) console.log(colors.yellow + "[onMap]" +resetColor+ map.favorite_coordinates);
    init_myMapBeliefset();
})


//OnYou event
const me = {};

client.onYou(({ id, name, x, y, score }) => {
    if(logs) console.log(colors.yellow + "[onYou] " +resetColor+ "receiving new position: (" + x +" - "+ y + ")");
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
})


//agents event 
let agent_delete_time = 10000;

client.onAgentsSensing( (agents) => {
    if(logs) console.log(colors.yellow + "[onAgents] " +resetColor+ "agent_sensing");
    let time = Date.now() - start;
    for(let a of agents){       //update info
        a.time = time;
        beliefSet_agents.set(a.id, a);
    }
    const idsToDelete = [];     //remove obsolete info
    for(const a of beliefSet_agents.values()){
        if(Date.now()-a.time>agent_delete_time){
            idsToDelete.push(a.id);
        }
    }
    for (const id of idsToDelete) {
        beliefSet_parcels.delete(id);
    }

    let printBelief = Array.from(beliefSet_agents.values()).map(({ id, name, x, y}) => {
        return `\t${name}:${x},${y}\n`;
    }).join(' ');
    if(logs) console.log(colors.yellow + "[onAgents] " +resetColor+ "memory agents:\n" + printBelief);
    option_generation(1);
})

//parcels event
client.onParcelsSensing( parcels => {
    if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "parcels_sensing");
    let time = Date.now();

    for (let p of parcels){     //update info
        p.time = time;
        beliefSet_parcels.set(p.id, p);
    }
    const idsToDelete = [];     //remove obsolete info
    for(const p of beliefSet_parcels.values()){
        if(p.reward<2){
            if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "delete parcel memory (expired nearby):", p);
            idsToDelete.push(p.id);
        }
        else if((p.carriedBy)&&(p.carriedBy != me.id)){
            if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "delete parcel memory (carried):", p);
            idsToDelete.push(p.id);
        }
        else if(!parcels.some(parcel => parcel.id == p.id)){
            if(distance_manhattan(me,p)<config.PARCELS_OBSERVATION_DISTANCE){
                if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "delete parcel memory (lost track):", p);
                idsToDelete.push(p.id);
            }
            else if(Date.now() - p.time > decay_time){
                p.reward -= Math.floor((Date.now()-p.time)/decay_time);
                if(p.reward > 2){
                    p.time = Date.now();
                    beliefSet_parcels.set(p.id, p);
                }
                else{
                    if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "delete parcel memory (expired somewhere):", p);
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
    if(logs) console.log(colors.yellow + "[onParcels] " +resetColor+ "parcel_memory:\n" + printBelief);
    option_generation(2);
})


//---------------------------------------------------------------------------------------------------
//option generator
const tiles_timeout = 4000;     //to not return to the same position to early
const norm_cost = 4;            //normalization costant -> tradeoff between decay_time & movement_time
const risk = 3;                 //(1...10) risk to not going directly to the biggest parcel

function option_generation(x){
    if(logs){           //to print the caller
        if(x==1){console.log(colors.blue + "[opt_gen] " +resetColor+ "agents call");}
        else if(x==2){console.log(colors.blue + "[opt_gen] " +resetColor+ "parcels call");}
        else if(x==3){console.log(colors.blue + "[opt_gen] " +resetColor+ "main loop call");}
    }

    const options = [];
    let parcels_on_me_counter = 0;
    let parcels_on_me_reward = 0;
    for (const parcel of beliefSet_parcels.values()){   //process all parcels I'm carrying
        if(parcel.carriedBy == me.id){          
            parcels_on_me_reward += parcel.reward;
            parcels_on_me_counter += 1;
        }
    }
    if(parcels_on_me_counter){ //compute option "go_deliver"
        let delivery_point = get_nearest_delivery_path(me);
        if(!delivery_point){
            if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "unable to find path to delivery from here ", me);
        }
        else{
            let priority;
            if(decay_time){
                priority = parcels_on_me_reward - (parcels_on_me_counter*delivery_point.distance)*(decay_time/1000)/(config.MOVEMENT_DURATION/norm_cost);
            }
            else{
                priority = parcels_on_me_reward;
            }
            options.push([priority, 'go_deliver', delivery_point.x, delivery_point.y]);
            //console.log("pushing go_deliver", delivery_point.x, delivery_point.y, "with priority:", priority ,"->", parcels_on_me_reward, "-", parcels_on_me_counter, delivery_point.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)
        }
    }

    for (const parcel of beliefSet_parcels.values()){
        if(parcel.carriedBy == me.id){          //I carry the parcel
            continue;
        }
        else if(!parcel.carriedBy){             //free parcel
            let distance_parcel = distance_path(me, parcel);    //and is reachable
            if (!distance_parcel){
                if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "unable to find path to", parcel);
                continue;
            }
            let delivery_point_from_parcel = get_nearest_delivery_path(parcel); //and is deliverable + there is a decay time
            if(!delivery_point_from_parcel && decay_time){ //??? warning -> coop doesn't works with this
                if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "unable to find nearest delivery point to", parcel);
                continue;
            }
            let base_priority;
            if(decay_time){     //compute priority & push option "go_pick_up"
                base_priority = parcel.reward + parcels_on_me_reward - (parcels_on_me_counter+1)*(distance_parcel+delivery_point_from_parcel.distance)*(decay_time/1000)/(config.MOVEMENT_DURATION/norm_cost);
            }
            else{
                base_priority = parcel.reward + parcels_on_me_reward;
            }
            options.push([base_priority, 'go_pick_up', parcel.x, parcel.y]);
            //console.log("pushing go_pick_up", parcel.x, parcel.y, "with priority:", priority ,"->", parcel.reward , parcels_on_me_reward, "-", parcels_on_me_counter+1, distance_percel,"+",delivery_point_from_parcel.distance,
            //    decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)

            //compute 2 package option
            for (const parcel2 of beliefSet_parcels.values()){
                if(parcel2.carriedBy || parcel2 === parcel){
                    continue;
                }
                //add deviation to the path
                let distance_parcel2 = distance_path(me, parcel2);
                let distance_parcel2_parcel = distance_path(parcel2, parcel);
                if (!distance_parcel2 || !distance_parcel2_parcel){
                    continue; // ensure all paths are valid
                }
                if(parcel2.reward < (distance_parcel2 + distance_parcel2_parcel - distance_parcel)*risk){
                    continue; // check if it's worth
                }
                let combine_priority = base_priority + parcel2.reward - (distance_parcel2 + distance_parcel2_parcel - distance_parcel)*risk
                options.push([combine_priority, 'go_pick_up', parcel2.x, parcel2.y]);
            }


            if(parcels_on_me_counter){    //second option (go deliver first)
                let delivery_point = get_nearest_delivery_path(me);
                if (!delivery_point.distance) {
                    continue;
                }
                base_priority = parcel.reward + parcels_on_me_reward - ((parcels_on_me_counter + 1) * delivery_point.distance + delivery_point_from_parcel.distance * 2)*(decay_time/1000)/(config.MOVEMENT_DURATION/norm_cost);
                options.push([base_priority, 'go_deliver', delivery_point.x, delivery_point.y]);
                //console.log("pushing go_deliver", delivery_point_from_parcel.x, delivery_point_from_parcel.y, "with priority:", priority ,"->", parcel.reward , parcels_on_me_reward,
                //   "-", parcels_on_me_counter+1, delivery_point.distance,"+",delivery_point_from_parcel.distance, decay_time/1000, "/",config.MOVEMENT_DURATION/norm_cost)
                //compute 2 package option
                for (const parcel2 of beliefSet_parcels.values()){
                    if(parcel2.carriedBy || parcel2 === parcel){
                        continue;
                    }
                    //add deviation to the path
                    let distance_parcel2 = distance_path(me, parcel2);
                    let distance_parcel2_delivery_point = distance_path(parcel2, delivery_point);
                    if (!distance_parcel2 || !distance_parcel2_delivery_point){
                        continue; // ensure all paths are valid
                    }
                    let deviation_priority = parcel2.reward - (distance_parcel2 + distance_parcel2_delivery_point - delivery_point.distance)*risk
                    if(deviation_priority<0){
                        continue; // check if it's worth
                    }
                    options.push([base_priority + deviation_priority, 'go_pick_up', parcel2.x, parcel2.y]);
                }
            }
        }
        else{
            if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "something enexpected happend while generating options");
            return 1;   //end of the option generation
        }
    }
    //find & push the best option
    let best_option;
    let max_priority = Number.MIN_SAFE_INTEGER;
    for (const option of options) {
        if (option[0] > max_priority){
            max_priority = option[0];
            best_option = option;
        }
    }

    if(!best_option && map.favorite_coordinates){   //no parcel detected
        if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "no option found, going for favorite coordinates");
        //let time = config.MOVEMENT_DURATION*map.favorite_coordinates.length;
        let time = Date.now();
        for(let position of map.favorite_coordinates){
            if(position.time!=start && time - position.time < tiles_timeout){
                continue;   //timeout
            }
            if(distance_manhattan(me,position)<3){
                position.time = time;
                continue;   //to close (planner calls are expensive)
            }
            let distance = distance_path(me,position);
            if(distance){
                options.push([position.value-distance-100, "go_to", position.x, position.y]); //-100-> priority go_to < all others cases (per coop)
            }
        }
        if(options.length>0){
            for (const option of options) {
                if (option[0] > max_priority){
                    max_priority = option[0];
                    best_option = option;
                }
            }
        }
    }

    if(best_option){
        let selectedPosition = map.favorite_coordinates.find(position => position.x === best_option[2] && position.y === best_option[3]);
        if (selectedPosition) {
            selectedPosition.time = Date.now();
        }
        myAgent.push(best_option);
    }
    else{
        if(logs) console.log(colors.blue + "[opt_gen] " +resetColor+ "unable to generate any options");
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
            if(logs) console.log(colors.red + "[main_loop] " +resetColor+ "==================================================================>",loop_counter++);
            // Consumes intention_queue if not empty
            if (this.intention_queue.length > 0) {
                try {
                    if(logs) console.log(colors.red + "[main_loop] " +resetColor+ 'intentionRevision.loop', this.intention_queue.map(i => i.predicate));

                } catch (error) {
                    if(logs) console.log(error)
                }

                // Current intention
                const intention = this.intention_queue[0];
                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch(error => {
                    if(logs) console.log( colors.red + "[main_loop] " +resetColor+ 'failed intention', ...intention.predicate, 'with error:', error )
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

    async push(predicate){

        // Check if already queued
        const last = this.intention_queue.at(this.intention_queue.length - 1);
        if(last){
            if(logs) console.log(colors.pink + "[Intentions] " +resetColor+ "---check-if-replace------>",last.predicate,"----with----",predicate);
            if(last.predicate[1]=="go_to" && predicate[1] == "go_to"){
                return;
            }
            else if((last.predicate[1]==predicate[1])&&(last.predicate[2]==predicate[2])&&(last.predicate[3]==predicate[3])){
                last.predicate[0]=predicate[0]; //intention already ongoing 
                return;
            }
            else if (last.predicate[0] >= predicate[0]){
                return; //intention has less priority
            }
        }
        else{
            if(logs) console.log(colors.pink + "[Intentions] " +resetColor+ "---> no last in the queue");
        }

        if(logs) console.log(colors.pink + "[Intentions] " +resetColor+ "---> IntentionRevisionReplace.push", predicate);
        const intention = new Intention(this, predicate);
        this.intention_queue.push(intention);

        // Force current intention stop 
        if (last) {
            last.stop();
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Start intention revision loop
 */

const myAgent = new IntentionRevisionReplace();
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
            this.#parent.log( ...args)
        else
        if(logs) console.log(colors.green + "[plan] " +resetColor,...args)
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
            if (this.stopped) throw ['[achive intent] stopped intention', ...this.predicate];
            if (planClass.isApplicableTo(this.predicate[1])) {
                this.#current_plan = new planClass(this.#parent);
                this.log(colors.pink + '[achive intent] ' +resetColor+ 'achieving intention', ...this.predicate, 'with plan', planClass.name);
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log(colors.pink + '[achive intent] ' +resetColor+ 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res
                    // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log(colors.pink + '[achive intent] ' +resetColor+ 'failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
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
        this.log( 'stop plan' );
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
            if(logs) console.log(colors.green + "[plan] " +resetColor, ...args)
    }
}


class Plan_single extends Plan{

    static isApplicableTo(intention){
        return (intention == 'go_pick_up' || intention == 'go_to' || intention == 'go_deliver');
    }

    async execute(priority, intention, x, y){
        let plan = await generate_plan(intention,x,y,0);
        if (this.stopped) throw ['stopped'];
        if (!plan || plan.length === 0) {
            if(logs) console.log(colors.green + "[plan] " +resetColor+ "plan not found" + resetColor);
            throw ['failed (no plan found)'];
        }
        else {
            if(logs) console.log(colors.green + "[plan] " +resetColor+ "plan found");
            for (let step of plan){
                let action = step.action;
                if (action == "MOVE"){
                    if (this.stopped) throw ['stopped'];
                    let [ag, from, to] = step.args;
                    if(logs) console.log(colors.green + "[plan] " +resetColor+ " starting moving to", to);
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
                            if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> execute STOPPED");
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
                            if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> retrying");
                            counter++;
                            continue;
                        }
                        else if(counter==3){
                            if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> execute STUCKED");
                            throw ["[plan] stucked"];
                        }
                        else{
                            me.x = x;
                            me.y = y;
                        }
                        if(logs) console.log(colors.green + "[plan] " +resetColor+ intention, "(me.pos=", x, y +")", "(moving", last_action+")");
                    }
                } else if (action == "GRAB") {
                    let [ag, ob, pos] = step.args;
                    await client.pickup();
                    if(logs) console.log(colors.green + "[plan] " +resetColor +`${ag} grab ${ob} in ${pos}`);
                } else if (action == "DROP") {
                    let [ag, ob, pos] = step.args;
                    await client.putdown();
                    delete_put_down();
                    if(logs) console.log(colors.green + "[plan] " +resetColor+ `${ag} drop ${ob} in ${pos}`);
                }
            }
            return "success";
        }
    }
}



class Plan_coop extends Plan{

    static isApplicableTo(intention){
        return (intention == 'nothing'); //???? non so cosa ci va
    }
    async execute(priority, intention, x, y){
        let plan = generate_plan(intention,x,y,1);
        if (this.stopped) throw ['stopped']; //???? send the 'stap waiting' message
        if (!plan || plan.length === 0) {
            if(logs) console.log(colors.green + "[plan] " +resetColor+ "plan not found" + resetColor);
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
                        if(logs) console.log(colors.green + "[plan] " +resetColor+ "starting moving to reach", to);
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
                                if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> execute STOPPED");
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
                                if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> retrying");
                                counter++;
                                continue;
                            }
                            else if(counter==3){
                                if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> execute STUCKED");
                                throw ["[plan] stucked"];
                            }
                            else{
                                me.x = x;
                                me.y = y;
                            }
                            if(logs) console.log(colors.green + "[plan] " +resetColor+ intention,x,y,last_action);
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
                        if(logs) console.log(colors.green + "[plan] " +resetColor +`${ag} grab ${ob} in ${pos}`);
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
                        if(logs) console.log(colors.green + "[plan] " +resetColor+ `${ag} drop ${ob} in ${pos}`);
                    }
                }
            }
            //send(partner plan_terminated); //???? send the 'stap waiting' message
            return "success";
        }
    }
}

class Plan_receiver extends Plan{
    static isApplicableTo(intention){
        return (intention == 'nothing'); //???? non so cosa ci va
    }

    async execute(){ //???? adattala come vuoi
        while(!plan_terminated){  //???? set to receive the terminal message
            let step //= wait_instruction //????
            let action = step.action;
            if (action == "MOVE"){
                let [ag, ag2, from, to] = step.args;
                if(logs) console.log(colors.green + "[plan] " +resetColor+ " starting moving to", to);
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
                        if(logs) console.log(colors.green + "[plan] " +resetColor+ "-> retrying");
                        counter++;
                        continue;
                    }
                    else if(counter==3){
                        if(logs) console.log(colors.green + "[plan]" +resetColor+ "-> execute STUCKED");
                        throw ["[plan] stucked"];
                    }
                    else{
                        me.x = x;
                        me.y = y;
                    }
                    if(logs) console.log(colors.green + "[plan] " +resetColor+ intention,x,y,last_action);
                }
            } else if (action == "GRAB") {
                let [ag, ob, pos] = step.args;
                await client.pickup();
                if(logs) console.log(colors.green + "[plan] " +resetColor +`${ag} grab ${ob} in ${pos}`);
            } else if (action == "DROP") {
                let [ag, ob, pos] = step.args;
                await client.putdown();
                delete_put_down();
                if(logs) console.log(colors.green + "[plan] " +resetColor+ `${ag} drop ${ob} in ${pos}`);
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
        myBeliefset.declare(`on partner p${partner.x}_${partner.y}`);
        myBeliefset.declare(`different partner me`);
        myBeliefset.declare(`different me partner`);
        if(intention == 'go_deliver'){
            myBeliefset.declare(`holding partner target`); //????to define who has the package (me or partner)
            goal = `on_pkg target p${x}_${y}`;
        }
        else{
            if(logs) console.log(colors.green + "[plan] " +resetColor+ "coop mode with unknown intention");
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

    let plan;
    if(!coop){
        plan = await onlineSolver(domain, problem);
    }
    else{
        plan = await onlineSolver(domain_coop, problem);
    }
    return plan;
}