async function getLatestMeasurementsForStation(id) {
    const r = await fetch(`/measurement/${id}/brief`);
    return r.json();
}

function buildTableRow(name, value, unit) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");

    const useBraces = name && value && unit;
    th.innerText = useBraces ? `${name} (${unit})` : `${name} ${unit}`;
    td.innerText = `${value} ${unit}`;

    tr.appendChild(th);
    tr.appendChild(td);

    return tr;
}

function buildListEntry(crop) {
    const li = document.createElement("li");
    li.classList.add("list-group-item");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("crop-icon");
    svg.setAttribute("viewBox", "0 0 512 512");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0l32 0c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64l32 0c123.7 0 224 100.3 224 224l0 32 0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160C100.3 320 0 219.7 0 96z");

    svg.appendChild(path);
    
    li.appendChild(svg);
    li.appendChild(document.createTextNode(crop));

    return li;
}

async function UpdateRecommendedCrops(measurements) {
    const cropList = document.querySelector('.crop-list');
    while (cropList.children.length > 0)
        cropList.removeChild(cropList.firstChild);

    const recommendedCrops = await fetch(`/crop/${sessionStorage.getItem("last-station")}/recommendCrops`);

    const crops = await recommendedCrops.json();

    if (crops.length === 0) {
        cropList.appendChild(buildListEntry("Keine Empfohlenen Pflanzenkulturen"));
        return;
    }

    for (const crop of crops) {
        const li = buildListEntry(crop);
        cropList.appendChild(li);
    }
}

async function UpdateSidebar(measurements) {
    const sidebar = document.querySelector('.sidebar');
    const dataTable = sidebar.querySelector(".selected-station-data-table");

    //Clear table
    while (dataTable.children.length > 0)
        dataTable.removeChild(dataTable.firstChild);

    if (measurements.length === 0) {
        const row = buildTableRow("No Data available for selected station", "", "");

        dataTable.appendChild(row);
        return;
    }

    for (const measurement of measurements) {
        const row = buildTableRow(measurement.name, measurement.value, measurement.unit);
        dataTable.appendChild(row);
    }
}

async function StationPaneClickHandler(ev) {
    ev.preventDefault();

    const stationPane = ev.currentTarget;
    const dataset = stationPane.dataset;

    //Reset all shit
    [...document.querySelectorAll("div.station-element")].forEach((element) => {
        element.classList.remove("shadow");
        element.style.backgroundColor = '#E3E3E3';
    });
    /*
        stationPane.style.filter = "hue-rotate(40deg)";*/
    stationPane.style.backgroundColor = '#fafaf5';
    stationPane.classList.add("shadow");

    const guid = dataset.guid;

    const latest = await getLatestMeasurementsForStation(guid);
    sessionStorage.setItem("last-station", guid);

    await UpdateSidebar(latest);
    await UpdateRecommendedCrops(latest);
}

document.addEventListener("DOMContentLoaded", async (ev) => {
    const stationElements = [...document.querySelectorAll("div.station-element")];

    for (const e of stationElements) {
        e.addEventListener("click", StationPaneClickHandler);
    }

    if (stationElements.length > 0)
        await StationPaneClickHandler({
            preventDefault() {
            }, currentTarget: stationElements[0]
        });
});

