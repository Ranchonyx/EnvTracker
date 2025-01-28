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

async function RenderChartAndDisplays(type = localStorage.getItem("last-type")) {
    const today = new Date().toISOString();

    const dateFromElement = document.querySelector("#date-from");
    const dateToElement = document.querySelector("#date-to");

    const shouldUseDateFrame = dateFromElement.value.length > 0 && dateToElement.value.length > 0;

    const timeFrameParams = shouldUseDateFrame ? `from=${new Date(dateFromElement.value).toISOString()}&to=${new Date(dateToElement.value).toISOString()}` : `forDay=${today}`;
    const groupingParams = `&groupBy=${localStorage.getItem("last-group") || "HOUR_AND_MINUTE"}`;

    const myStationId = getStationId();
    const typeDataRequest = await fetch(`/measurement/${getStationId()}/${type}?${timeFrameParams}${groupingParams}`);
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

function createDropdownEntry(name) {
    const anchor = document.createElement("a");
    anchor.classList.add("dropdown-item");
    anchor.href = "#";
    anchor.innerText = name;

    anchor.addEventListener("click", dropDownTypeClickListener);

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


async function dropDownTypeClickListener(ev) {
    ev.preventDefault();
    const typeSpecifier = ev.target.textContent;

    const targetText = `${typeSpecifier}`;

    localStorage.setItem("last-type", typeSpecifier);

    document.querySelector(".dropdown-types-toggle").textContent = targetText;

    await RenderChartAndDisplays();
}

async function dropDownGroupCliclListener(ev) {
    ev.preventDefault();
    const groupSpecifier = ev.target.textContent;

    const targetText = `${groupSpecifier}`;

    localStorage.setItem("last-group", groupSpecifier);

    document.querySelector(".dropdown-groups-toggle").textContent = targetText;

    await RenderChartAndDisplays();
}

function SetupGroupDropdown() {
    const dropdownMenu = document.querySelector(".dropdown-menu-groups");
    dropdownMenu.querySelectorAll("a.dropdown-item").forEach(entry => {
        entry.addEventListener("click", dropDownGroupCliclListener);
    })
}

document.addEventListener("DOMContentLoaded", async (ev) => {
    ev.preventDefault();

    const sc = SocketClient.getInstance(HandleWebsocketResponse);
    globalThis.sc = sc;

    sc.Send(`subscribe#new-record-${getStationId()}`);

    await SetupTypeDropdown();
    SetupGroupDropdown();

    localStorage.removeItem("last-type");
    globalThis.ChartRenderer = chartRenderer("#sensorChart");
});