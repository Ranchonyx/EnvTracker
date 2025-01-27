function chartRenderer(selector) {
    const canvas = document.querySelector(selector);
    const ctx = canvas.getContext("2d");
    let chart = new Chart(ctx, {});

    return {
        chart: chart,
        ctx: ctx,
        render: (chartData) => {
            chart.destroy();
            chart = new Chart(ctx, chartData, {});
        },
        reset: () => {
            chart.reset();
        },
        renderMessage: (message) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.font = "100px Arial";
            ctx.fillText(message, 0, 100);
        }
    }
}

function getStationId() {
    return sessionStorage.getItem("last-station");
}

async function RenderChartAndDisplays() {
    const today = new Date().toISOString();

    const myStationId = getStationId();
    const typeDataRequest = await fetch(`/measurement/${getStationId()}/Temperature?forDay=${today}`);
    const typeData = await typeDataRequest.json();

    const chartDataResponse = await fetch(`/chart/${myStationId}/transform`, {
        method: "POST",
        body: JSON.stringify(typeData),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    const maxValueElement = document.querySelector("#maxValue");
    const minValueElement = document.querySelector("#minValue");
    const avgValueElement = document.querySelector("#averageValue");

    if (chartDataResponse.status === 400) {
        //No data for today... render a message
        ChartRenderer.renderMessage("Keine Messwerte verfügbar");
        maxValueElement.textContent = "--";
        minValueElement.textContent = "--";
        avgValueElement.textContent = "--";

        return;
    }

    const chartData = await chartDataResponse.json();


    maxValueElement.textContent = `${Math.max(...typeData.map(e => parseFloat(e.value))).toFixed(2)} ${typeData[0].unit}`;
    minValueElement.textContent = `${Math.min(...typeData.map(e => parseFloat(e.value))).toFixed(2)} ${typeData[0].unit}`;

    const accumulated = typeData
        .map(e => parseFloat(e.value))
        .reduce((acc, v) => acc + v, 0);

    avgValueElement.textContent = `${(accumulated / typeData.length).toFixed(2)} ${typeData[0].unit}`;


    globalThis.ChartRenderer.render(chartData);
}

async function HandleWebsocketResponse(message) {
    const json = JSON.parse(message);

    //Update existing chart with new dataaaaaaaaaaaa
    if(json.data === localStorage.getItem("last-type")) {
        await RenderChartAndDisplays(json.data);
    }
}

document.addEventListener("DOMContentLoaded", async (ev) => {
    ev.preventDefault();

    const sc = SocketClient.getInstance(HandleWebsocketResponse);
    globalThis.sc = sc;

    sc.Send(`subscribe#new-record-${getStationId()}`);

    localStorage.removeItem("last-type");
    globalThis.ChartRenderer = chartRenderer("#sensorChart");
});