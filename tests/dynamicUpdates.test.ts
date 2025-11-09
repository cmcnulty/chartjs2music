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

    test("Data updates preserve dataset visibility in chart2music", () => {
        const mockElement = document.createElement("canvas");
        const mockAudioEngine = new MockAudioEngine();

        const chart = new Chart(mockElement, {
            type: "bar",
            data: {
                labels: ["A", "B"],
                datasets: [
                    {
                        label: "Dataset 1",
                        data: [100, 110]
                    },
                    {
                        label: "Dataset 2",
                        data: [50, 55]
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

        // Wait for chart to initialize
        chart.update();
        jest.advanceTimersByTime(250);

        // Get chart2music instance
        const state = chartStates.get(chart);
        expect(state).toBeDefined();
        const c2mInstance = state!.c2m;

        // Hide Dataset 2
        chart.setDatasetVisibility(1, false);
        chart.update();
        jest.advanceTimersByTime(250);

        // Update data values (like toggling annual/monthly in wrs-chart)
        // This simulates what happens when user toggles annual/monthly display
        chart.data.datasets[0].data = [200, 220];
        chart.data.datasets[1].data = [100, 110];
        chart.update();
        jest.advanceTimersByTime(250);

        // Check the current point value (Chart2Music starts at index 0)
        const current = c2mInstance.getCurrent();

        // THE BUG: Without the fix, the "All" group value will be 300 (200 + 100)
        // because setData() updated the values but didn't sync visibility,
        // so Chart2Music thinks Dataset 2 is still visible.
        // With the fix, "All" should only be 200 (just Dataset 1, excluding hidden Dataset 2)
        expect(current.group).toBe("All");
        // @ts-ignore - accessing y value from point
        expect(current.point.y).toBe(200); // Should only include visible Dataset 1, not hidden Dataset 2

        chart.destroy();
    });

    test("Data updates use correct axis bounds for categorical x-axis", () => {
        const mockElement = document.createElement("canvas");
        const mockAudioEngine = new MockAudioEngine();

        // Create chart with 19 labels (ages 47-65)
        const labels = [];
        for(let age = 47; age <= 65; age++) {
            labels.push(`Age ${age}`);
        }

        const chart = new Chart(mockElement, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Income",
                    data: Array(19).fill(0).map((_, i) => 20000 + i * 1000)
                }]
            },
            options: {
                animation: false,
                scales: {
                    x: { type: 'category' },
                    y: { type: 'linear' }
                },
                plugins: {
                    chartjs2music: {
                        audioEngine: mockAudioEngine
                    }
                }
            }
        });

        // Wait for chart to initialize
        chart.update();
        jest.advanceTimersByTime(250);

        // Get chart2music instance
        const state = chartStates.get(chart);
        expect(state).toBeDefined();
        const c2mInstance = state!.c2m;

        // Spy on setData to see what axes values are passed
        const setDataSpy = jest.spyOn(c2mInstance, 'setData');

        // Update data values
        chart.data.datasets[0].data = Array(19).fill(0).map((_, i) => 30000 + i * 1500);
        chart.update();
        jest.advanceTimersByTime(250);

        // THE BUG: setData should be called with axes.x.maximum = 18 (labels.length - 1)
        // Without the fix, it might get a wrong value from Chart.js scale config
        expect(setDataSpy).toHaveBeenCalled();

        const lastCall = setDataSpy.mock.calls[setDataSpy.mock.calls.length - 1];
        const axes = lastCall[1]; // Second argument to setData is axes

        // For categorical axis with 19 labels, Chart2Music needs:
        // minimum: 0 (first index)
        // maximum: 18 (last index)
        expect(axes.x.minimum).toBe(0);
        expect(axes.x.maximum).toBe(18);

        chart.destroy();
    });
});
