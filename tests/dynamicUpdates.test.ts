import {
    Chart,
    CategoryScale,
    LineController,
    PointElement,
    LineElement,
    BarController,
    LinearScale,
    BarElement,
} from "chart.js";
import plugin, { chartStates } from "../src/c2m-plugin";

Chart.register(
    plugin,
    CategoryScale,
    LineController,
    PointElement,
    LineElement,
    BarController,
    LinearScale,
    BarElement,
);

jest.useFakeTimers();
window.AudioContext = jest.fn().mockImplementation(() => {
    return {};
});

beforeEach(() => {
    jest.clearAllMocks();
});

/**
 * Mock audio engine for testing
 */
class MockAudioEngine {
    playHistory: Array<{frequency: number, panning: number, duration: number}> = [];

    playDataPoint(frequency: number, panning: number, duration: number): void {
        this.playHistory.push({ frequency, panning, duration });
    }
}

describe("Dynamic Data Updates", () => {
    test("Chart data can be updated without errors", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "bar",
                data: {
                    labels: ["A", "B", "C"],
                    datasets: [{
                        label: "Dataset 1",
                        data: [1, 2, 3]
                    }]
                }
            });

            // Update data - should not throw
            chart.data.datasets[0].data = [5, 10, 15];
            chart.update();
        }).not.toThrow();
    });

    test("Chart data can be appended without errors", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "line",
                data: {
                    labels: ["Point 1", "Point 2"],
                    datasets: [{
                        label: "Temperature",
                        data: [20, 22]
                    }]
                }
            });

            // Append new data points - should not throw
            chart.data.labels?.push("Point 3");
            chart.data.labels?.push("Point 4");
            chart.data.datasets[0].data.push(25);
            chart.data.datasets[0].data.push(27);
            chart.update();
        }).not.toThrow();
    });

    test("Multiple datasets can be updated without errors", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "line",
                data: {
                    labels: ["A", "B"],
                    datasets: [
                        {
                            label: "Series 1",
                            data: [1, 2]
                        },
                        {
                            label: "Series 2",
                            data: [3, 4]
                        }
                    ]
                }
            });

            // Update both datasets - should not throw
            chart.data.datasets[0].data = [10, 20];
            chart.data.datasets[1].data = [30, 40];
            chart.update();
        }).not.toThrow();
    });

    test("Data updates work with labels", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "line",
                data: {
                    labels: ["January", "February"],
                    datasets: [{
                        data: [10, 15]
                    }]
                }
            });

            // Append data with new label - should not throw
            chart.data.labels?.push("March");
            chart.data.datasets[0].data.push(20);
            chart.update();
        }).not.toThrow();
    });

    test("Debug: What data does Chart2Music receive for stacked charts?", () => {
        const mockElement = document.createElement("canvas");
        const mockAudioEngine = new MockAudioEngine();

        const chart = new Chart(mockElement, {
            type: "bar",
            data: {
                labels: ["A", "B", "C"],
                datasets: [
                    {
                        label: "Dataset 1",
                        data: [10, 15, 20]
                    },
                    {
                        label: "Dataset 2",
                        data: [20, 25, 30]
                    },
                    {
                        label: "Dataset 3",
                        data: [30, 35, 40]
                    }
                ]
            },
            options: {
                animation: false,
                scales: {
                    x: { type: 'category', stacked: true },
                    y: { type: 'linear', stacked: true }
                },
                plugins: {
                    chartjs2music: {
                        audioEngine: mockAudioEngine
                    }
                }
            }
        });

        chart.update();
        jest.advanceTimersByTime(250);

        const state = chartStates.get(chart);
        const c2mInstance = state!.c2m;

        // Spy on console.error to see if setCategoryVisibility returns an error
        const errorSpy = jest.spyOn(console, 'error');

        chart.setDatasetVisibility(1, false);
        chart.update();
        jest.advanceTimersByTime(250);

        errorSpy.mockRestore();

        chart.destroy();
    });
});
