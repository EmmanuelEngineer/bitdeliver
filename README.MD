# Bitdeliver
A BDI agent built to win in the competetive game Deliveroo.


This repository is a BDI Agent that plays at the deliveroo game [deliveroo github](https://github.com/unitn-ASA/Deliveroo.js)  .
The objective of the game is to navigate inside a grid map to pick up packages and deliver them to defined delivery points.
Inside this grid map other players/Agents of other teams are present. 
They not only can block your path obstructing squares on the grid without letting you pass, but they also can take the parcels before you.

Knowing the layout of the map, the agent must be capable to place itself in the most advantageus grid squares.
But the agents are not omniscient, they have the map of the whole grid at their disposal, but they can see only other players and the parcels at a given distance defined by the Map.

The Agent is not alone, it can also coordinate with a teammate. The 2 teammates are not to representatives of the same agent, are 2 completly indipendent agents.
The can use the server chat to identify each other. Once they know their team mates they can exchange knowledge of the enviroment using a private chat and coordinate in case of difficult situations.

All of the details are present at the following link [Project Presentation](https://canva.link/xu4yajdbdiaervy)
