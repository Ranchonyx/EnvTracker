function VizButtonClickHandler(ev) {
    ev.preventDefault();

    const guid = sessionStorage.getItem("last-station");
    window.location.href = `/viz/${guid}`;
}

function AnalysisButtonClickHandler(ev) {
    ev.preventDefault();

    const guid = sessionStorage.getItem("last-station");
    window.location.href = `/analysis/${guid}`;
}

document.addEventListener("DOMContentLoaded", async () => {
    const vizButton = document.querySelector("a.visualisation");
    vizButton.addEventListener("click", VizButtonClickHandler);

    const analysisButton = document.querySelector("a.analysis");
    analysisButton.addEventListener("click", AnalysisButtonClickHandler);
});