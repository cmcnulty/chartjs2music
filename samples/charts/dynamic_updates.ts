// Example demonstrating dynamic data updates
// Click the "Update" button to see the chart data change
// The Chart2Music sonification will update automatically

import type { Chart, ChartData, ChartOptions, ChartTypeRegistry } from "chart.js";

const data: ChartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  datasets: [{
    label: 'Sales (in thousands)',
    data: [12, 19, 3, 5, 2, 3],
    borderWidth: 2
  }]
};

const options: ChartOptions = {
  scales: {
    y: {
      beginAtZero: true,
      title: {
        text: "Sales",
        display: true
      }
    },
    x: {
      title: {
        text: "Month",
        display: true
      }
    }
  },
  plugins: {
    title: {
      display: true,
      text: 'Dynamic Sales Data (Click Update to change data)'
    }
  }
};

export default {
  type: 'line' as keyof ChartTypeRegistry,
  data,
  options,
  // This function is called when the "Update" button is clicked
  updateData: (chart: Chart) => {
    // Generate new random data
    chart.data.datasets[0].data = chart.data.datasets[0].data.map(() =>
      Math.floor(Math.random() * 30) + 1
    );

    // Update the chart - this will trigger our new afterUpdate hook
    // which will call Chart2Music's setData() method
    chart.update();

    console.log('Chart data updated:', chart.data.datasets[0].data);
    return true;
  }
} as any;
