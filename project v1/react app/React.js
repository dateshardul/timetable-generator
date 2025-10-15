import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [nodes, setNodes] = useState('');
  const [edges, setEdges] = useState('');
  const [graphInfo, setGraphInfo] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await axios.post('http://localhost:3000/generate', {
        nodes: nodes.split(',').map(Number),
        edges: JSON.parse(edges)
      });
      setGraphInfo(result.data);
    } catch (error) {
      console.error('Error generating timetable:', error);
    }
  };

  return (
    <div>
      <h1>Timetable Generator</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={nodes}
          onChange={(e) => setNodes(e.target.value)}
          placeholder="Enter nodes as comma-separated values"
        />
        <textarea
          value={edges}
          onChange={(e) => setEdges(e.target.value)}
          placeholder="Enter edges as a JSON array of arrays"
        />
        <button type="submit">Generate Timetable</button>
      </form>
      <pre>{JSON.stringify(graphInfo, null, 2)}</pre>
    </div>
  );
}

export default App;
