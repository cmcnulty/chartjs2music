import type { ChartOptions, Plugin, Chart } from "chart.js";
import c2mChart, {c2m} from "chart2music";
import {processBoxData} from "./boxplots";

type ChartStatesTypes = {
    c2m: c2m;
    visible_groups: number[];
    lastDataSnapshot: string;
    scalesSynced: boolean; // Track if we've updated axes with computed scales
}

export const chartStates = new Map<Chart, ChartStatesTypes>();

const chartjs_c2m_converter: any = {
    bar: "bar",
    line: "line",
    pie: "pie",
    polarArea: "bar",
    doughnut: "pie",
    boxplot: "box",
    radar: "bar",
    wordCloud: "bar",
    scatter: "scatter"
};

const processChartType = (chart: any) => {
    const topLevelType = chart.config.type;

    const panelTypes = chart.data.datasets.map(({type}: any) => type ?? topLevelType);

    const invalid = panelTypes.find((t: string) => !(t in chartjs_c2m_converter));
    if(invalid){
        return {
            valid: false,
            invalidType: invalid
        }
    }

    if([...new Set(panelTypes)].length === 1){
        return {
            valid: true,
            c2m_types: chartjs_c2m_converter[panelTypes[0] as keyof typeof chartjs_c2m_converter]
        };
    }

    return {
        valid: true,
        c2m_types: panelTypes.map((t: string) => chartjs_c2m_converter[t])
    }
}

const generateAxisInfo = (chartAxisInfo: any, chart: any) => {
    const axis = {} as any;
    if(chartAxisInfo?.min !== undefined){
        if(typeof chartAxisInfo.min === "string"){
            axis.minimum = chart.data.labels.indexOf(chartAxisInfo.min);
        }else{
            axis.minimum = chartAxisInfo.min;
        }
    }
    if(chartAxisInfo?.max !== undefined){
        if(typeof chartAxisInfo.max === "string"){
            axis.maximum = chart.data.labels.indexOf(chartAxisInfo.max);
        }else{
            axis.maximum = chartAxisInfo.max;
        }
    }
    const label = chartAxisInfo?.title?.text;
    if(label){
        axis.label = label;
    }

    if(chartAxisInfo?.type === "logarithmic"){
        axis.type = "log10";
    }

    return axis;
}

const generateAxes = (chart: any) => {
    const axes = {
        x: {
            ...generateAxisInfo(chart.options?.scales?.x, chart),
        },
        y: {
            format: (value: number) => value.toLocaleString(),
            ...generateAxisInfo(chart.options?.scales?.y, chart),
        }
    };

    // Use Chart.js's computed scale values if not explicitly set in options
    // This is crucial for stacked charts where Chart.js auto-calculates the range
    // Without this, Chart2Music calculates its own range from individual dataset values
    // which gives wrong results (e.g., min from individual datasets instead of stacked totals)
    if(chart.scales?.y && axes.y.minimum === undefined){
        axes.y.minimum = chart.scales.y.min;
    }
    if(chart.scales?.y && axes.y.maximum === undefined){
        axes.y.maximum = chart.scales.y.max;
    }
    if(chart.scales?.x && axes.x.minimum === undefined){
        axes.x.minimum = chart.scales.x.min;
    }
    if(chart.scales?.x && axes.x.maximum === undefined){
        axes.x.maximum = chart.scales.x.max;
    }

    const xAxisValueLabels = chart.data.labels.slice(0);
    if(xAxisValueLabels.length > 0){
        axes.x.valueLabels = xAxisValueLabels;
    }

    return axes;
}

const whichDataStructure = (data: any[]) => {
    if(Array.isArray(data[0])){
        return data.map((arr: any, x: number) => {
            let [low, high] = arr.sort()
            return {x, low, high};
        });
    }
    return data;
}

const scrubX = (data: any) => {
    const blackboard = JSON.parse(JSON.stringify(data));

    let labels: string[] = [];
    if(Array.isArray(data)){
        // console.log("not grouped");
        // Not grouped
        blackboard.forEach((item, x) => {
            if(typeof item === "object" && item !== null && "x" in item){
                labels.push(item.x);
                item.x = x;
            }
        });
        return {labels, data: blackboard};

    }else{
        // Grouped

    }
}

const processData = (data: any, c2m_types: string) => {
    if(c2m_types === "box"){
        return processBoxData(data);
    }
    let groups: string[] = [];

    if(data.datasets.length === 1){
        return {
            data: whichDataStructure(data.datasets[0].data)
        }
    }

    const result = {} as Record<string, any>;

    data.datasets.forEach((obj: any, index: number) => {
        const groupName = obj.label ?? `Group ${index+1}`;
        groups.push(groupName);

        result[groupName] = whichDataStructure(obj.data);
    });

    return {groups, data: result};
}

const determineChartTitle = (options: ChartOptions) => {
    if(options.plugins?.title?.text){
        if(Array.isArray(options.plugins.title.text)){
            return options.plugins.title.text.join(", ");
        }
        return options.plugins.title.text;
    }
    return "";
}

const determineCCElement = (canvas: HTMLCanvasElement, provided: HTMLElement | null) => {
    if(provided){
        return provided;
    }

    const cc = document.createElement("div");
    canvas.insertAdjacentElement("afterend", cc);
    return cc;
}

const createDataSnapshot = (chart: Chart) => {
    return JSON.stringify({
        datasets: chart.data.datasets.map((ds, i) => ({
            data: ds.data,
            label: ds.label,
            visible: chart.isDatasetVisible(i) // Track visibility to detect changes
        })),
        labels: chart.data.labels
    });
}


const displayPoint = (chart: Chart) => {
    if(!chartStates.has(chart)){
        return;
    }
    const {c2m: ref, visible_groups} = chartStates.get(chart) as ChartStatesTypes;
    const {index} = ref.getCurrent();
    try{
        // Use Chart2Music's index directly to highlight corresponding Chart.js points
        const highlightElements = [];
        visible_groups.forEach((datasetIndex: number) => {
            highlightElements.push({
                datasetIndex,
                index
            })
        })
        chart?.setActiveElements(highlightElements);
        chart?.tooltip?.setActiveElements(highlightElements, {})
        chart?.update();
    }catch(e){
        // console.warn(e);
    }
}

const generateChart = (chart: Chart, options: ChartOptions) => {
    const {valid, c2m_types, invalidType} = processChartType(chart);

    if(!valid){
        // @ts-ignore
        options.errorCallback?.(`Unable to connect chart2music to chart. The chart is of type "${invalidType}", which is not one of the supported chart types for this plugin. This plugin supports: ${Object.keys(chartjs_c2m_converter).join(", ")}`);
        return;
    }

    let axes = generateAxes(chart);

    if(chart.config.type === "wordCloud"){
        delete axes.x.minimum;
        delete axes.x.maximum;
        delete axes.y.minimum;
        delete axes.y.maximum;

        if(!axes.x.label){
            axes.x.label = "Word";
        }
        if(!axes.y.label){
            axes.y.label = "Emphasis";
        }
    }

    // Generate CC element
    const cc = determineCCElement(chart.canvas, options.cc);

    const {data, groups} = processData(chart.data, c2m_types);
    // lastDataObj = JSON.stringify(data);

    let scrub = scrubX(data);
    if(scrub?.labels && scrub?.labels?.length > 0){   // Something was scrubbed
        if(!chart.data.labels || chart.data.labels.length === 0){
            axes.x.valueLabels = scrub.labels.slice(0);
        }
    }

    if(c2m_types === "scatter"){
        delete scrub?.data;
        delete axes.x.valueLabels;
    }

    axes = {
        ...axes,
        x: {
            ...axes.x,
            ...(options.axes?.x)
        },
        y: {
            ...axes.y,
            ...(options.axes?.y)
        },
    };

    const c2mOptions = {
        cc,
        element: chart.canvas,
        type: c2m_types,
        data: scrub?.data ?? data,
        title: determineChartTitle(chart.options),
        axes,
        options: {
            // @ts-ignore
            onFocusCallback: () => {
                displayPoint(chart);
            }
        }
    };

    if(Array.isArray(c2mOptions.data)){
        if(isNaN(c2mOptions.data[0])){
            c2mOptions.data = c2mOptions.data.map((point, index) => {
                return {
                    ...point,
                    custom: {
                        group: 0,
                        index
                    }
                }
            })
        }else{
            c2mOptions.data = c2mOptions.data.map((num, index) => {
                return {
                    x: index,
                    y: num,
                    custom: {
                        group: 0,
                        index
                    }
                }
            })
        }
    }else{
        const groups = Object.keys(c2mOptions.data);
        groups.forEach((groupName, groupNumber) => {
            if(!isNaN(c2mOptions.data[groupName][0])){
                c2mOptions.data[groupName] = c2mOptions.data[groupName].map((num: number, index: number) => {
                    return {
                        x: index,
                        y: num,
                        custom: {
                            group: groupNumber,
                            index
                        }
                    }
                })
            }else{
                c2mOptions.data[groupName] = c2mOptions.data[groupName].map((point: any, index: number) => {
                    return {
                        ...point,
                        custom: {
                            group: groupNumber,
                            index
                        }
                    }
                })
            }
        });
    }

    // @ts-ignore
    if(chart.config.options?.scales?.x?.stacked){
        // @ts-ignore
        c2mOptions.options.stack = true;
    }

        // @ts-ignore
    if(options.audioEngine){
        // @ts-ignore
        c2mOptions.audioEngine = options.audioEngine;
    }

    // Check if data is empty (for both arrays and objects with groups)
    if(Array.isArray(c2mOptions.data)){
        if(c2mOptions.data.length === 0){
            return;
        }
    }else{
        // For grouped data (multiple datasets), check if all groups are empty
        const groups = Object.keys(c2mOptions.data);
        const hasData = groups.some(group => c2mOptions.data[group].length > 0);
        if(!hasData){
            return;
        }
    }

    if(options.lang){
        c2mOptions.lang = options.lang;
    }

    const {err, data:c2m} = c2mChart(c2mOptions);

    /* istanbul-ignore-next */
    if(err){
        // @ts-ignore
        options.errorCallback?.(err);
        return;
    }

    if(!c2m){
        return;
    }

    chartStates.set(chart, {
        c2m,
        // Initialize visible_groups respecting Chart.js's current visibility state
        visible_groups: (groups?.map((g, i) => i) ?? [0]).filter(i => !chart.getDatasetMeta(i).hidden),
        lastDataSnapshot: createDataSnapshot(chart),
        scalesSynced: false // Scales aren't available yet in afterInit
    });

}

const plugin: Plugin = {
    id: "chartjs2music",

    afterInit: (chart: Chart, args, options) => {
        if(!chartStates.has(chart)){
            generateChart(chart, options);

            // Remove tooltip when the chart blurs
            chart.canvas.addEventListener("blur", () => {
                chart.setActiveElements([]);
                chart.tooltip?.setActiveElements([], {});
                try {
                    chart.update();
                } catch(e){
                    // console.warn(e);
                }
            });

            // Show tooltip when the chart receives focus
            chart.canvas.addEventListener("focus", () => {
                displayPoint(chart);
            });
        }
    },

    afterDatasetUpdate: (chart: Chart, args, options) => {
        if(!args.mode){
            return;
        }

        if(!chartStates.has(chart)){
            generateChart(chart, options);
        }

        const {c2m: ref, visible_groups} = chartStates.get(chart) as ChartStatesTypes;
        if(!ref){
            return;
        }

        // @ts-ignore
        const groups = ref._groups.slice(0);
        // @ts-ignore
        if(ref._options.stack){
            groups.shift();
        }

        if(args.mode === "hide"){
            const err = ref.setCategoryVisibility(groups[args.index], false);
            visible_groups.splice(args.index, 1);
            if(err){console.error(err)}
            return;
        }

        if(args.mode === "show"){
            const err = ref.setCategoryVisibility(groups[args.index], true);
            visible_groups.push(args.index);
            if(err){console.error(err)}
            return;
        }
    },

    afterUpdate: (chart: Chart, args, options) => {
        // If chart wasn't initialized (e.g., started empty), try to initialize now
        if(!chartStates.has(chart)){
            // Check if chart now has data
            if(chart.data.datasets.length > 0 && chart.data.datasets[0].data.length > 0){
                generateChart(chart, options);
                // After initialization, continue to sync scales (don't return early)
                // Fall through to scale sync below
            } else {
                // Still no data, nothing to do
                return;
            }
        }

        const state = chartStates.get(chart) as ChartStatesTypes;
        const {c2m: ref, lastDataSnapshot, scalesSynced} = state;

        if(!ref){
            return;
        }

        // Check if we need to sync scales now that they're available
        const needsScaleSync = !scalesSynced && chart.scales?.y;

        // Check if data has changed
        const currentSnapshot = createDataSnapshot(chart);
        const dataChanged = currentSnapshot !== lastDataSnapshot;

        if(!dataChanged && !needsScaleSync){
            return; // No data changes and scales already synced
        }

        // If we only need to sync scales (no data change), update Chart2Music's axes directly
        // to avoid announcing "Chart updated" when data hasn't actually changed
        if(needsScaleSync && !dataChanged){
            const axes = generateAxes(chart);
            // @ts-ignore - accessing Chart2Music internals to update axes without triggering update announcement
            if(axes.y.minimum !== undefined){
                ref._yAxis.minimum = axes.y.minimum;
            }
            if(axes.y.maximum !== undefined){
                ref._yAxis.maximum = axes.y.maximum;
            }
            if(axes.x.minimum !== undefined){
                ref._xAxis.minimum = axes.x.minimum;
            }
            if(axes.x.maximum !== undefined){
                ref._xAxis.maximum = axes.x.maximum;
            }
            state.scalesSynced = true;
            return;
        }

        // Data has changed - use setData() to update Chart2Music
        const {valid, c2m_types} = processChartType(chart);
        if(!valid){
            return;
        }

        let axes = generateAxes(chart);

        if(chart.config.type === "wordCloud"){
            delete axes.x.minimum;
            delete axes.x.maximum;
            delete axes.y.minimum;
            delete axes.y.maximum;

            if(!axes.x.label){
                axes.x.label = "Word";
            }
            if(!axes.y.label){
                axes.y.label = "Emphasis";
            }
        }

        const {data, groups} = processData(chart.data, c2m_types);

        let scrub = scrubX(data);
        if(scrub?.labels && scrub?.labels?.length > 0){
            if(!chart.data.labels || chart.data.labels.length === 0){
                axes.x.valueLabels = scrub.labels.slice(0);
            }
        }

        if(c2m_types === "scatter"){
            delete scrub?.data;
            delete axes.x.valueLabels;
        }

        axes = {
            ...axes,
            x: {
                ...axes.x,
                ...(options.axes?.x)
            },
            y: {
                ...axes.y,
                ...(options.axes?.y)
            },
        };

        let processedData = scrub?.data ?? data;

        // Add custom metadata for Chart2Music
        if(Array.isArray(processedData)){
            if(!isNaN(processedData[0])){
                // Convert simple numbers to x/y format
                processedData = processedData.map((num, index) => {
                    return {
                        x: index,
                        y: num,
                        custom: {
                            group: 0,
                            index
                        }
                    }
                })
            }else{
                // Add custom metadata to existing objects
                processedData = processedData.map((point, index) => {
                    return {
                        ...point,
                        custom: {
                            group: 0,
                            index
                        }
                    }
                })
            }
        }else{
            // Handle grouped data
            const dataGroups = Object.keys(processedData);
            dataGroups.forEach((groupName, groupNumber) => {
                if(!isNaN(processedData[groupName][0])){
                    processedData[groupName] = processedData[groupName].map((num: number, index: number) => {
                        return {
                            x: index,
                            y: num,
                            custom: {
                                group: groupNumber,
                                index
                            }
                        }
                    })
                }else{
                    processedData[groupName] = processedData[groupName].map((point: any, index: number) => {
                        return {
                            ...point,
                            custom: {
                                group: groupNumber,
                                index
                            }
                        }
                    })
                }
            });
        }

        // For stacked charts, recalculate axis range from the actual visible data
        // Chart.js keeps scales fixed for visual stability, but Chart2Music needs dynamic range for audio
        if(chart.options?.scales?.y?.stacked && groups && groups.length > 0 && !Array.isArray(processedData)){
            // Calculate stacked totals from visible datasets only
            const groupNames = Object.keys(processedData);
            // Filter to only visible datasets
            const visibleGroupNames = groupNames.filter((_, index) => chart.isDatasetVisible(index));
            const numPoints = processedData[groupNames[0]]?.length || 0;

            if(numPoints > 0 && visibleGroupNames.length > 0){
                const stackedTotals: number[] = [];
                for(let i = 0; i < numPoints; i++){
                    let total = 0;
                    visibleGroupNames.forEach(groupName => {
                        const point = processedData[groupName][i];
                        if(point && point.y !== undefined && !isNaN(point.y)){
                            total += point.y;
                        }
                    });
                    stackedTotals.push(total);
                }

                if(stackedTotals.length > 0){
                    const computedMin = Math.min(...stackedTotals);
                    const computedMax = Math.max(...stackedTotals);
                    // Only override if user hasn't set explicit min/max
                    if(chart.options?.scales?.y?.min === undefined){
                        axes.y.minimum = computedMin;
                    }
                    if(chart.options?.scales?.y?.max === undefined){
                        axes.y.maximum = computedMax;
                    }
                }
            }
        }

        // Preserve user's current position if possible
        const current = ref.getCurrent();
        const pointIndex = current?.index;

        // Call Chart2Music's setData method (returns void, doesn't report errors)
        ref.setData(processedData, axes, pointIndex);

        // Update the snapshot after successful update
        state.lastDataSnapshot = currentSnapshot;
        // Mark that we've synced scales (they're now in the axes we just passed to setData)
        state.scalesSynced = true;

        // Sync dataset visibility from Chart.js to Chart2Music
        // setData() doesn't preserve visibility state, so we must re-sync it
        if(groups){
            // Get Chart2Music's internal groups (similar to afterDatasetUpdate)
            // @ts-ignore
            const c2mGroups = ref._groups.slice(0);
            // @ts-ignore
            if(ref._options.stack && c2mGroups[0] === "All"){
                c2mGroups.shift(); // Remove "All" group for stacked charts
            }

            // Sync visibility for each dataset/group
            c2mGroups.forEach((groupName: string, i: number) => {
                const isVisible = !chart.getDatasetMeta(i).hidden;
                ref.setCategoryVisibility(groupName, isVisible);
            });

            // Update visible groups tracking
            state.visible_groups = groups
                .map((g, i) => i)
                .filter(i => !chart.getDatasetMeta(i).hidden);
        }
    },

    afterDestroy: (chart) => {
        const {c2m: ref} = chartStates.get(chart) as ChartStatesTypes;
        if(!ref){
            return;
        }

        ref.cleanUp();
    },

    defaults: {
        cc: null,
        audioEngine: null,
        errorCallback: null
    }

};

export default plugin;