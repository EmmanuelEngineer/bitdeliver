import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'http://localhost:8080',//,'https://deliveroojs.onrender.com/'
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJhNzA4MWI0MWI0IiwibmFtZSI6ImVtbWF2aWNvIiwiaWF0IjoxNzEzODgyNTc1fQ.-Q9-GGbdMCj4Ji8XwQDENC8QtRx9aW9MuTRUpJeY0Ls')


function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

function getRelativePosition(x,y){
    let string;
    if (x.x > y.x) string = "left"
    else if (x.x < y.x) string = "right"
    else if (x.y > y.y) string = "down"
    else if (x.y < y.y) string = "up"
    else string = "same"
    return string;
}

const me = {};

client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

const db = new Map()

client.onParcelsSensing( async ( parcels ) => {
    
    const pretty = Array.from(parcels)
        .map( ( {id,x,y,carriedBy,reward} ) => {
            return `(${x},${y},${carriedBy},${reward})`; //
        } )
        .join( ' ' )

    for (let parcel of parcels){
        if(distance(parcel,me)<5 ){//&& parcel.carriedBy==null
            let movement = getRelativePosition(me,parcel)
            if(movement == "same")
                await client.pickup();
            else
                await client.move(movement)
            console.log(movement)

        }
    }
    console.log( pretty )

} )


