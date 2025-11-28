import {
    Chart,
    CategoryScale,
    BarController,
    LinearScale,
    BarElement,
} from "chart.js";
import plugin from "../src/c2m-plugin";

Chart.register(
    plugin,
    CategoryScale,
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

describe("Empty Chart Initialization", () => {
    test("Chart starts empty without errors", () => {
        const mockParent = document.createElement("div");
        const mockElement = document.createElement("canvas");
        mockParent.appendChild(mockElement);

        // Create chart with empty data
        const chart = new Chart(mockElement, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    data: []
                }]
            }
        });

        // Should have canvas element but no C2M initialization yet
        expect(mockElement).toBeTruthy();

        // Focus should not cause errors
        expect(() => {
            mockElement.dispatchEvent(new Event("focus"));
        }).not.toThrow();
    });

    test("Empty chart can have data added without errors", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "bar",
                data: {
                    labels: [],
                    datasets: [{
                        data: []
                    }]
                }
            });

            // Add data - should not throw
            chart.data.labels = ["A", "B", "C"];
            chart.data.datasets[0].data = [1, 2, 3];
            chart.update();
        }).not.toThrow();
    });

    test("Empty chart can be updated multiple times without errors", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "bar",
                data: {
                    labels: [],
                    datasets: [{
                        data: []
                    }]
                }
            });

            // First update - add initial data
            chart.data.labels = ["A", "B"];
            chart.data.datasets[0].data = [1, 2];
            chart.update();

            // Second update - change data
            chart.data.datasets[0].data = [10, 20];
            chart.update();

            // Third update - append data
            chart.data.labels?.push("C");
            chart.data.datasets[0].data.push(30);
            chart.update();
        }).not.toThrow();
    });

    test("Empty chart with multiple datasets can be updated", () => {
        const mockElement = document.createElement("canvas");

        expect(() => {
            const chart = new Chart(mockElement, {
                type: "bar",
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: "Series 1",
                            data: []
                        },
                        {
                            label: "Series 2",
                            data: []
                        }
                    ]
                }
            });

            // Add data to both datasets - should not throw
            chart.data.labels = ["A", "B"];
            chart.data.datasets[0].data = [1, 2];
            chart.data.datasets[1].data = [3, 4];
            chart.update();
        }).not.toThrow();
    });
});
