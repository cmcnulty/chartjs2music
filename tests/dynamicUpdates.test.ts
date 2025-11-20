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

    test("Axes update when showing initially hidden dataset", () => {
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

        // Let chart initialize first
        chart.update();
        jest.advanceTimersByTime(250);

        const state = chartStates.get(chart);
        const c2mInstance = state!.c2m;

        console.log("After init - all visible - Chart.js Y scale:", chart.scales.y.min, "to", chart.scales.y.max);
        console.log("Dataset 1 visible?", chart.isDatasetVisible(0));
        console.log("Dataset 2 visible?", chart.isDatasetVisible(1));
        console.log("Dataset 3 visible?", chart.isDatasetVisible(2));

        // Now hide Dataset 2
        chart.setDatasetVisibility(1, false);
        chart.update();
        jest.advanceTimersByTime(250);

        console.log("After hide - Dataset 2 hidden - Dataset 2 visible?", chart.isDatasetVisible(1));

        // Check state after hiding: Dataset 2 is hidden, so Y axis should be 0 to 60 (10+30 at index 2)
        // @ts-ignore
        console.log("After hide - Chart2Music Y axis:", c2mInstance._yAxis.minimum, "to", c2mInstance._yAxis.maximum);
        console.log("After hide - Chart.js computed Y scale:", chart.scales.y.min, "to", chart.scales.y.max);
        // @ts-ignore
        expect(c2mInstance._yAxis.maximum).toBe(60);

        // Now show Dataset 2
        chart.setDatasetVisibility(1, true);
        chart.update();
        jest.advanceTimersByTime(250);

        // After showing: Y axis should be 0 to 90 (10+20+30 at index 2)
        // @ts-ignore
        console.log("After show - Chart2Music Y axis:", c2mInstance._yAxis.minimum, "to", c2mInstance._yAxis.maximum);
        console.log("After show - Chart.js computed Y scale:", chart.scales.y.min, "to", chart.scales.y.max);
        // @ts-ignore
        expect(c2mInstance._yAxis.maximum).toBe(90);

        chart.destroy();
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

        // @ts-ignore - access Chart2Music internals
        console.log("Chart2Music groups:", c2mInstance._groups);
        // @ts-ignore
        console.log("Chart2Music data (by index):");
        // @ts-ignore
        c2mInstance._groups.forEach((groupName, idx) => {
            // @ts-ignore
            console.log(`  [${idx}] ${groupName}:`, c2mInstance._data[idx]?.[0], c2mInstance._data[idx]?.[1], c2mInstance._data[idx]?.[2]);
        });
        // @ts-ignore
        console.log("Chart2Music Y axis:", c2mInstance._yAxis);
        console.log("Chart.js computed Y scale:", chart.scales.y.min, "to", chart.scales.y.max);

        console.log("\n--- Now hiding Dataset 2 (Chart.js dataset index 1) ---");

        // Spy on console.error to see if setCategoryVisibility returns an error
        const errorSpy = jest.spyOn(console, 'error');

        chart.setDatasetVisibility(1, false);
        chart.update();
        jest.advanceTimersByTime(250);

        console.log("setCategoryVisibility errors:", errorSpy.mock.calls);
        errorSpy.mockRestore();

        // @ts-ignore
        console.log("After hiding - Chart2Music data (by index):");
        // @ts-ignore
        c2mInstance._groups.forEach((groupName, idx) => {
            // @ts-ignore
            console.log(`  [${idx}] ${groupName}:`, c2mInstance._data[idx]?.[0], c2mInstance._data[idx]?.[1], c2mInstance._data[idx]?.[2]);
        });
        // @ts-ignore
        console.log("After hiding - Chart2Music Y axis:", c2mInstance._yAxis);
        // @ts-ignore
        console.log("After hiding - visible group indices:", c2mInstance._visible_group_indices);

        chart.destroy();
    });
});
