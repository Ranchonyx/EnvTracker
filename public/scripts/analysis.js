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
    const temperatureData = await typeDataRequest.json();

    const predictionDataRequest = await fetch(`/prediction/${getStationId()}/predictTemperature`);
    const predictionData = await predictionDataRequest.json();

    const chartDataResponse = await fetch(`/chart/${myStationId}/transform`, {
        method: "POST",
        body: JSON.stringify(temperatureData),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });

    const predictionDataChartResponse = await fetch(`/chart/${myStationId}/transform`, {
        method: "POST",
        body: JSON.stringify(predictionData),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });


    const statusElement = document.querySelector("#status");

    if (chartDataResponse.status === 400) {
        //No data for today... render a message
        ChartRenderer.renderMessage("Keine Messwerte verfügbar");

        return;
    }

    const chartData = await chartDataResponse.json();
    const predictionChartData = await predictionDataChartResponse.json();

/*    for (let i = 0; i < predictionChartData.data.labels.length; i++) {
        predictionChartData.data.labels[i] = `P+${i}`;
    }*/

    predictionChartData.data.datasets[0].backgroundColor = "rgba(255, 99, 132, 0.2)";
    predictionChartData.data.datasets[0].borderColor = "rgba(255, 99, 132, 1)";

    chartData.data.datasets.push(predictionChartData.data.datasets[0]);
    chartData.data.labels.push(...predictionChartData.data.labels);

    globalThis.ChartRenderer.render(chartData);
    statusElement.textContent = `Temp / P(Temp)`;
}

async function HandleWebsocketResponse(message) {
    const json = JSON.parse(message);

    //Update existing chart with new dataaaaa
    if (json.data === localStorage.getItem("last-type")) {
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
    ChartRenderer.renderMessage("Lade Daten...");

    await RenderChartAndDisplays();
});
