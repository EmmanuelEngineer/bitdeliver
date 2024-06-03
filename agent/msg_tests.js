import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { Pathfinder, Node } from './Pathfinder.mjs';
import { Utilities as ut } from "./Utilities.js"
const client = new DeliverooApi(
    'http://localhost:8080/?name=pollo',
    ''
)
const logs = true;
const me = {};
const communication = { master: false, partner_id: null }
client.onYou(({ id, name, x, y, score }) => {
    //if(logs) console.log(colors.yellow + "[onYou]" +resetColor+ "receiving new position");
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
})
//broadcast to let the other agent know that there is a connection available
const partner_interval = setInterval(
    function () {
        client.shout('🍗🍗🍗');
        console.log("searching partner")
    }, 100);


// Defining the Master/Slave relationship based on the biggest string, bigger id is the master
function set_role(id) {
    if (me.id > id) {
        communication.master = true
        console.log("I'm the Master")
        clearInterval(partner_interval)
    } else {
        communication.master = false
        console.log("I'm the Slave")
        clearInterval(partner_interval)
    }

    communication.partner_id = id
}



client.onMsg(async (id, name, msg, reply) => {
    console.log("received:", msg)

    //teammate searching the partner (is allowed to reset the role in case the teammate crashed)
    if (msg == "🍗🍗🍗") {
        console.log("asking");
        let reply = await client.ask(id, '🐔🐔🐔');
        if (reply == "🐔🐔🐔") set_role(id)
    }
    // The teammate handshake 
    if (msg == "🐔🐔🐔" && !communication.partner_id) {
        if (reply) {// per protocol definition the teammate must use the ask method, so the field reply must be not null
            console.log("replying")
            try { reply("🐔🐔🐔") } catch { (error) => console.error(error) }
            set_role(id)
        }
        else console.log("⚠️⚠️⚠️" + colors.red + " the handshake didn't respect the protocol" + resetColor)
    }
    //communication between partners has protocol the excange of messages  msg.type and msg.obj
    if (id == communication.partner_id) {//if is the partner
        if (msg.type == "beliefset_agents") {
            for (let a of msg.obj) {
                if (beliefSet_agents.has(a.id)) {
                    if (a.time < beliefSet_agents.get(a.id).time) {
                        beliefSet_agents.set(a.id, a)
                    }
                }
            }
        }else
        if (msg.type == "beliefset_parcels") {
            for (let a of msg.obj) {
                if (beliefSet_parcels.has(a.id)) {
                    if (a.time < beliefSet_parcels.get(a.id).time) {
                        beliefSet_parcels.set(a.id, a)
                    }
                }
            }
        }else
        if (msg.type == "intention_update") { //TODO support the possibility to generate a second best-option 
            for (let a of msg.obj) {
                if (beliefSet_parcels.has(a.id)) {
                    if (a.time < beliefSet_parcels.get(a.id).time) {
                        beliefSet_parcels.set(a.id, a)
                    }
                }
            }
        }
        else { console.log("⚠️⚠️⚠️" + colors.red + " TEAMMATE SENT A NON SUPPORTED MESSAGE TYPE" + resetColor) }
    }
});
