// server.js
const express = require('express');
const bodyParser = require('body-parser');
const nx = require('networkx');
const app = express();
const port = 3000;

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send("Welcome to the Graph-based Timetable Generator!");
});

function createInitialTimetable(nodes, edges) {
    const G = new nx.Graph();
    G.addNodesFrom(nodes);
    G.addEdgesFrom(edges);
    return G;
}

function updateTimetableWithGameTheory(graph, changes) {
    // Hypothetical logic: Prioritize changes based on some strategy
    for (let change of changes) {
        if ('add' in change) {
            graph.addEdge(change.add[0], change.add[1]);
        } else if ('remove' in change) {
            graph.removeEdge(change.remove[0], change.remove[1]);
        }
    }
    return graph;
}

app.post('/generate', (req, res) => {
    const data = req.body;
    const nodes = data.nodes;
    const edges = data.edges;
    const graph = createInitialTimetable(nodes, edges);
    res.json(nx.info(graph));
});

app.post('/update', (req, res) => {
    const data = req.body;
    const changes = data.changes;
    const graph = nx.parseGraphML(data.graphml);
    const updatedGraph = updateTimetableWithGameTheory(graph, changes);
    res.json(nx.info(updatedGraph));
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
