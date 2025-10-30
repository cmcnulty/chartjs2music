import type { ChartOptions, Plugin, Chart } from "chart.js";
import c2mChart, {c2m} from "chart2music";
import {processBoxData} from "./boxplots";

type ChartStatesTypes = {
    c2m: c2m;
    visible_groups: number[];
    lastDataSnapshot: string;
}

const chartStates = new Map<Chart, ChartStatesTypes>();

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
        datasets: chart.data.datasets.map(ds => ({
            data: ds.data,
            label: ds.label
        })),
        labels: chart.data.labels
    });
}

const detectAppendScenario = (chart: Chart, lastSnapshot: string) => {
    try {
        const oldData = JSON.parse(lastSnapshot);
        const newData = {
            datasets: chart.data.datasets.map(ds => ({
                data: ds.data,
                label: ds.label
            })),
            labels: chart.data.labels
        };

        // Check if same number of datasets
        if(oldData.datasets.length !== newData.datasets.length){
            return null; // Not a simple append
        }

        // Check if only one dataset changed
        const changedDatasets: number[] = [];
        for(let i = 0; i < oldData.datasets.length; i++){
            if(oldData.datasets[i].data.length !== newData.datasets[i].data.length){
                changedDatasets.push(i);
            }
        }

        // Only handle single dataset append for now
        if(changedDatasets.length !== 1){
            return null; // Multiple datasets changed or no change
        }

        const datasetIndex = changedDatasets[0];
        const oldDataset = oldData.datasets[datasetIndex];
        const newDataset = newData.datasets[datasetIndex];

        // Check if new data is longer (append, not replace)
        if(newDataset.data.length <= oldDataset.data.length){
            return null; // Not an append
        }

        // Check if old data is unchanged (pure append)
        const oldLength = oldDataset.data.length;
        const oldDataStr = JSON.stringify(oldDataset.data.slice(0, oldLength));
        const newDataStr = JSON.stringify(newDataset.data.slice(0, oldLength));

        if(oldDataStr !== newDataStr){
            return null; // Old data changed, not a pure append
        }

        // Check if labels also appended
        const labelsAppended = (newData.labels?.length ?? 0) > (oldData.labels?.length ?? 0);
        if(labelsAppended){
            const oldLabelLen = oldData.labels?.length ?? 0;
            const oldLabelsStr = JSON.stringify(oldData.labels?.slice(0, oldLabelLen) ?? []);
            const newLabelsStr = JSON.stringify(newData.labels?.slice(0, oldLabelLen) ?? []);
            if(oldLabelsStr !== newLabelsStr){
                return null; // Old labels changed
            }
        }

        // This is a pure append scenario!
        return {
            datasetIndex,
            newPoints: newDataset.data.slice(oldLength),
            categoryName: newDataset.label,
            oldLength
        };
    } catch(e){
        return null; // Error parsing, fall back to setData
    }
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
                    ...point
                }
            })
        }else{
            c2mOptions.data = c2mOptions.data.map((num, index) => {
                return {
                    x: index,
                    y: num
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
                        y: num
                    }
                })
            }else{
                c2mOptions.data[groupName] = c2mOptions.data[groupName].map((point: any, index: number) => {
                    return {
                        ...point
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
        visible_groups: groups?.map((g, i) => i) ?? [0], // Default to [0] for single dataset charts
        lastDataSnapshot: createDataSnapshot(chart)
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
            }
            // Whether we initialized or not, we're done for this update
            return;
        }

        const state = chartStates.get(chart) as ChartStatesTypes;
        const {c2m: ref, lastDataSnapshot} = state;

        if(!ref){
            return;
        }

        // Check if data has changed
        const currentSnapshot = createDataSnapshot(chart);
        if(currentSnapshot === lastDataSnapshot){
            return; // No data changes
        }

        // TODO: Re-enable append optimization once Chart2Music fixes appendData to update axis valueLabels
        // Issue: appendData() doesn't update _xAxis.valueLabels, causing keyboard navigation to miss labels for appended points
        // Detection code preserved for future use:
        const appendInfo = detectAppendScenario(chart, lastDataSnapshot);

        //const appendInfo = null; // Temporarily disabled

        if(appendInfo){
            // Optimized path: use appendData() for streaming
            const {newPoints, categoryName, datasetIndex, oldLength} = appendInfo;

            // Determine if this is a grouped chart
            const isGrouped = chart.data.datasets.length > 1;
            const targetCategory = isGrouped ? categoryName : undefined;

            // Process each new point and append it
            let appendFailed = false;
            newPoints.forEach((newPoint, idx) => {
                if(appendFailed) return;

                const pointIndex = oldLength + idx;

                // Get the corresponding label from chart.data.labels if it exists
                const pointLabel = chart.data.labels?.[pointIndex];

                // Format according to Chart2Music's SimpleDataPoint interface
                let processedPoint: any;
                if(typeof newPoint === 'number'){
                    processedPoint = {
                        x: pointIndex,
                        y: newPoint,
                        ...(pointLabel ? { label: String(pointLabel) } : {})
                    };
                } else if(typeof newPoint === 'object' && newPoint !== null){
                    processedPoint = {
                        x: ('x' in newPoint && typeof newPoint.x === 'number') ? newPoint.x : pointIndex,
                        y: ('y' in newPoint) ? newPoint.y : newPoint,
                        ...(pointLabel ? { label: String(pointLabel) } : {})
                    };
                } else {
                    processedPoint = newPoint;
                }

                // Use appendData for efficient streaming
                const {err} = ref.appendData(processedPoint, targetCategory);

                if(err){
                    console.error(`[Chart2Music] appendData failed:`, err);
                    // @ts-ignore
                    options.errorCallback?.(err);
                    appendFailed = true;
                }
            });

            if(appendFailed){
                // Fall back to full setData update
                state.lastDataSnapshot = lastDataSnapshot; // Reset to trigger full update below
            } else {
                // Update snapshot after successful append
                state.lastDataSnapshot = currentSnapshot;
                return;
            }
        }

        // Data has changed - use setData() for all updates
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

        // Keep data in native Chart2Music format without custom metadata
        if(Array.isArray(processedData)){
            if(!isNaN(processedData[0])){
                // Convert simple numbers to x/y format
                processedData = processedData.map((num, index) => {
                    return {
                        x: index,
                        y: num
                    }
                })
            }
            // Already in correct format if isNaN(processedData[0])
        }else{
            // Handle grouped data
            const dataGroups = Object.keys(processedData);
            dataGroups.forEach((groupName) => {
                if(!isNaN(processedData[groupName][0])){
                    processedData[groupName] = processedData[groupName].map((num: number, index: number) => {
                        return {
                            x: index,
                            y: num
                        }
                    })
                }
                // Already in correct format if isNaN
            });
        }

        // Preserve user's current position if possible
        const current = ref.getCurrent();
        const pointIndex = current?.index;

        // Call Chart2Music's setData method (returns void, doesn't report errors)
        ref.setData(processedData, axes, pointIndex);

        // Update the snapshot after successful update
        state.lastDataSnapshot = currentSnapshot;

        // Update visible groups if groups changed
        if(groups){
            state.visible_groups = groups.map((g, i) => i);
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