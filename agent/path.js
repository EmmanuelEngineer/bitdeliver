

  // Define the A* search function
  function aStar(start, goal) {
    // Create an empty data structure to store the explored paths
    let explored = [];
  
    // Create a data structure to store the paths that are being explored
    let frontier = [{
      state: start,
      cost: 0,
      estimate: heuristic(start)
    }];
  
    // While there are paths being explored
    while (frontier.length > 0) {
      // Sort the paths in the frontier by cost, with the lowest-cost paths first
      frontier.sort(function(a, b) {
        return a.estimate- b.estimate;
      });
  
      // Choose the lowest-cost path from the frontier
      let node = frontier.shift();
  
      // Add this nodeto the explored paths
      explored.push(node);
      // If this nodereaches the goal, return thenode 
      if (node.state.x == goal.x && node.state.y == goal.y) {
        return explored
      }
  
  
      // Generate the possible next steps from this node's state
      let next = generateNextSteps(node.state);
  
      // For each possible next step
      for (let i = 0; i < next.length; i++) {
        // Calculate the cost of the next step by adding the step's cost to the node's cost
        let step = next[i];
        let cost = step.cost + node.cost;
  
        // Check if this step has already been explored
        let isExplored = (explored.find( e => {
            return e.state.x == step.state.x && 
                e.state.y == step.state.y
        }))

        //avoid repeated nodes during the calculation of neighbors
        let isFrontier = (frontier.find( e => {
            return e.state.x == step.state.x && 
                e.state.y == step.state.y
        }))


        // If this step has not been explored
        if (!isExplored && !isFrontier) {
          // Add the step to the frontier, using the cost and the heuristic function to estimate the total cost to reach the goal
          frontier.push({
            state: step.state,
            cost: cost,
            estimate: cost + heuristic(step.state)
          });
        }
      }
    }
  
    // If there are no paths left to explore, return null to indicate that the goal cannot be reached
    return null;
  }
  



  // Define the function to generate the possible next steps from a given state
function generateNextSteps(state) {
    // Define an array to store the next steps
    let next = [];
  
    // Check if the current state has any valid neighbors
    if (state.x > 0) {
      // If the current state has a neighbor to the left, add it to the array of next steps
      if(!isObstacle(state.x - 1, state.y)) {
        next.push({
          state: { x: state.x - 1, y: state.y },
          cost: 1
        });
      }
    }
    if (state.x < width - 1) {
      // If the current state has a neighbor to the right, add it to the array of next steps
      if(!isObstacle(state.x + 1, state.y)) {
        next.push({
          state: { x: state.x + 1, y: state.y },
          cost: 1
        });
      }
    }
    if (state.y > 0) {
      // If the current state has a neighbor above it, add it to the array of next steps
      if(!isObstacle(state.x, state.y - 1)) {
        next.push({
          state: { x: state.x, y: state.y - 1 },
          cost: 1
        });
      }
    }
    if (state.y < height - 1) {
      // If the current state has a neighbor below it, add it to the array of next steps
      if(!isObstacle(state.x, state.y + 1)) {
        next.push({
          state: { x: state.x, y: state.y + 1 },
          cost: 1
        });
      }
    }
  
    // Return the array of next steps
    return next;
  }

  function isObstacle(x, y) {
    return obstacles.find( o => o.x == x && o.y == y)
  }


function heuristic(state) {
    // Calculate the number of steps required to reach the goal, using the Manhattan distance formula
    let dx = Math.abs(state.x - goal.x);
    let dy = Math.abs(state.y - goal.y);
    let penalty = pathIntersectsObstacle(state, goal, obstacles) * 10
    return Math.sqrt(dx*dx + dy * dy) + penalty;
  }


function pathIntersectsObstacle(start, end, obstacles) {
    // Convert the starting and ending coordinates to grid coordinates
    let {x:startX, y:startY} = start;
    let {x:endX, y:endY} = end;
  
    // Get the coordinates of all points on the path
    let path = getPath(startX, startY, endX, endY);
  
    //get the points in the array that are within the list of obstacles
    let instersections =  path.filter( point => !!obstacles.find( o => o.x == point[0] && o.y == point[1]) ).length
    return instersections
  }


function getPath(startX, startY, endX, endY) {
    // Initialize an empty array to store the coordinates of the points on the path
    let path = [];
  
    // Use the Bresenham's line algorithm to get the coordinates of the points on the path
    let x1 = startX, y1 = startY, x2 = endX, y2 = endY;
    let isSteep = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    if (isSteep) {
      [x1, y1] = [y1, x1];
      [x2, y2] = [y2, x2];
    }
    let isReversed = false;
    if (x1 > x2) {
      [x1, x2] = [x2, x1];
      [y1, y2] = [y2, y1];
      isReversed = true;
    }
    let deltax = x2 - x1, deltay = Math.abs(y2 - y1);
    let error = Math.floor(deltax / 2);
    let y = y1;
    let ystep = null;
    if (y1 < y2) {
      ystep = 1;
    } else {
      ystep = -1;
    }
    for (let x = x1; x <= x2; x++) {
      if (isSteep) {
        path.push([y, x]);
      } else {
        path.push([x, y]);
      }
      error -= deltay;
      if (error < 0) {
        y += ystep;
        error += deltax;
      }
    }
  
    // If the line is reversed, reverse the order of the points in the path
    if (isReversed) {
      path = path.reverse();
    }
  
    return path;
  }


 // Define a function to display the grid and the nodeon the screen
function displayGrid(path) {
    // Create a two-dimensional array to represent the grid
    let grid = [];
    for (let x = 0; x < width; x++) {
      grid[x] = [];
      for (let y = 0; y < height; y++) {
        grid[x][y] = " . ";
      }
    }
  
    // Mark the starting and goal states on the grid
    grid[start.x][start.y] = " S ";
    grid[goal.x][goal.y] = " G ";

    obstacles.forEach( obs => {
      grid[obs.x][obs.y] = " - "
    })
  
    // Mark the path on the grid
    let finished = false;
    let sortedPath = path.sort((a,b) => a.estimate - b.estimate)
    let currentCost = 0;
    let costs = []
    while(!finished) {
      let step = sortedPath.shift() 
      if(step.state.x == goal.x && step.state.y == goal.y) {
        finished = true
      } else {
        if(!costs.includes(step.cost)){
          grid[step.state.x][step.state.y] = " X " 
          costs.push(step.cost)
        }
      }
      currentCost++
    }
  
    // Print the grid to the console
    for (let y = 0; y < height; y++) {
      let line = "";
      for (let x = 0; x < width; x++) {
        line += grid[x][y]
      }
      console.log(line)
    }
  }