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

async function UpdateRecommendedCrops(measurements) {
    const sidebar = document.querySelector('.sidebar');
    const recommendedCrops = await fetch(`/crop/${sessionStorage.getItem("last-station", guid)}/recommendCrops`, {
        method: "POST",
        body: JSON.stringify(measurements),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    })

    const crops = await recommendedCrops.json();

    for(const crop of crops) {
        const li = document.createElement("li");
        li.classList.add("list-group-item");

        const i = document.createElement("i");
        i.classList.add("bi bi-seedling me-2");

        li.appendChild(i);
        li.appendChild(document.createTextNode(crop));

        sidebar.appendChild(li);
    }
}

async function UpdateSidebar(measurements) {
    const sidebar = document.querySelector('.sidebar');
    const dataTable = sidebar.querySelector(".selected-station-data-table");

    //Clear table
    while (dataTable.children.length > 0)
        dataTable.removeChild(dataTable.firstChild);

    if(measurements.length === 0) {
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

