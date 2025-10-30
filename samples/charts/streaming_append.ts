// Example demonstrating streaming/appending new data points
// Click "Append Data" to add a new data point to the end of the chart

import type { Chart, ChartData, ChartOptions, ChartTypeRegistry } from "chart.js";

const data: ChartData = {
  labels: ['Point 1', 'Point 2', 'Point 3'],
  datasets: [{
    label: 'Temperature (°C)',
    data: [20, 22, 21],
    borderWidth: 2
  }]
};

const options: ChartOptions = {
  scales: {
    y: {
      beginAtZero: true,
      max: 35,
      title: {
        text: "Temperature",
        display: true
      }
    },
    x: {
      title: {
        text: "Time",
        display: true
      }
    }
  },
  plugins: {
    title: {
      display: true,
      text: 'Streaming Temperature Data (Click to append new data points)'
    }
  }
};

let pointCounter = 4;

export default {
  type: 'line' as keyof ChartTypeRegistry,
  data,
  options,
  // This function is called when the "Update" button is clicked
  updateData: (chart: Chart) => {
    // Append a new data point
    const newTemp = Math.floor(Math.random() * 15) + 15; // Random temp between 15-30
    chart.data.labels?.push(`Point ${pointCounter}`);
    chart.data.datasets[0].data.push(newTemp);
    pointCounter++;

    // Update the chart - should trigger afterUpdate hook
    chart.update();

    console.log(`Appended new data point: ${newTemp}°C`);
    console.log('Total points:', chart.data.datasets[0].data.length);
    return true;
  }
} as any;
