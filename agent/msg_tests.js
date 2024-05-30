import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
import { Utilities as ut } from "./Utilities.js"
const client = new DeliverooApi(
    'http://localhost:8080/?name=pollo',
    ''
)
const logs = true;
const me = {};
var master = false;
var partner_found = false;
client.onYou(({ id, name, x, y, score }) => {
    //if(logs) console.log(colors.yellow + "[onYou]" +resetColor+ "receiving new position");
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
})

const partner_interval = setInterval(
    function () {
        client.shout('🍗🍗🍗');
        console.log("searching partner")
    }, 100);


function set_role(id){
    if (me.id > id) {
        master = true;
        console.log("I'm the Master")
        clearInterval(partner_interval)
    } else {
        master = false;
        console.log("I'm the Slave")
        clearInterval(partner_interval)
    }

    partner_found = true
}

client.onMsg(async (id, name, msg, reply) => {
    console.log("received:", msg)
    if (msg == "🍗🍗🍗") {// there is no block with the partner_found if the other agent crashes
        console.log("asking");
        let reply = await client.ask(id, '🐔🐔🐔');
        if (reply == "🐔🐔🐔") set_role(id)
    }
    if (msg == "🐔🐔🐔" && !partner_found) {
        set_role(id)
        if (reply){
            console.log("replying")
            try { reply("🐔🐔🐔") } catch { (error) => console.error(error) }
        }
    }


});
