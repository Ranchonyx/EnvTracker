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

async function RenderChartAndDisplays(type) {
    const today = new Date().toISOString();

    const dateFromElement = document.querySelector("#date-from");
    const dateToElement = document.querySelector("#date-to");

    const shouldUseDateFrame = dateFromElement.value.length > 0 && dateToElement.value.length > 0;

    const params = shouldUseDateFrame ? `from=${new Date(dateFromElement.value).toISOString()}&to=${new Date(dateToElement.value).toISOString()}` : `forDay=${today}`;

    const myStationId = getStationId();
    const typeDataRequest = await fetch(`/measurement/${getStationId()}/${type}?${params}`);
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

    //Update existing chart with new dataaaaa
    if(json.data === localStorage.getItem("last-type")) {
        await RenderChartAndDisplays(json.data);
    }
}

async function QueryAvailableMeasurementTypes() {
    const request = await fetch(`/measurement/${getStationId()}/types`);
    return request.json();
}

async function entryClickEventListener(ev) {
    ev.preventDefault();
    const typeSpecifier = ev.target.textContent;

    const targetText = `Messwerte (${typeSpecifier})`;

    localStorage.setItem("last-type", typeSpecifier);

    document.querySelector(".dropdown-toggle").textContent = targetText;

    await RenderChartAndDisplays(typeSpecifier);
}

function createDropdownEntry(name) {
    const anchor = document.createElement("a");
    anchor.classList.add("dropdown-item");
    anchor.href = "#";
    anchor.innerText = name;

    anchor.addEventListener("click", entryClickEventListener);

    return anchor;
}

async function SetupTypeDropdown() {
    const types = await QueryAvailableMeasurementTypes();

    //Ignore last entry "all"
    const dropdownEntries = types
        .slice(0, -1)
        .map(entry => createDropdownEntry(entry));

    const dropdownMenu = document.querySelector(".dropdown-menu-types");

    //Clear dropdown entries
    while (dropdownMenu.hasChildNodes())
        dropdownMenu.removeChild(dropdownMenu.firstChild);

    dropdownMenu.append(...dropdownEntries);
}

document.addEventListener("DOMContentLoaded", async (ev) => {
    ev.preventDefault();

    const sc = SocketClient.getInstance(HandleWebsocketResponse);
    globalThis.sc = sc;

    sc.Send(`subscribe#new-record-${getStationId()}`);

    await SetupTypeDropdown();

    localStorage.removeItem("last-type");
    globalThis.ChartRenderer = chartRenderer("#sensorChart");
});