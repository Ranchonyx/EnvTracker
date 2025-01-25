function VizButtonClickHandler(ev) {
    ev.preventDefault();

    const guid = sessionStorage.getItem("last-station");
    window.location.href = `/viz/${guid}`;
}

document.addEventListener("DOMContentLoaded", async () => {
    const vizButton = document.querySelector("a.visualisation");
    vizButton.addEventListener("click", VizButtonClickHandler);
});