/**
 * main.js — Punto de entrada de la aplicación
 * Inicializa la UI, enlaza los botones con la simulación y maneja eventos.
 */

(function () {
    'use strict';

    // Referencias a botones y slider
    const btnStart = document.getElementById('btnStart');
    const btnStep = document.getElementById('btnStep');
    const btnAuto = document.getElementById('btnAuto');
    const btnReset = document.getElementById('btnReset');
    const btnDownload = document.getElementById('btnDownload');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');

    // Tabs de escenario
    const tabBasic = document.getElementById('tabBasic');
    const tabPIP = document.getElementById('tabPIP');

    /**
     * Ejecuta un paso de simulación y actualiza la UI
     */
    function executeStep() {
        if (simulation.completed) {
            ui.updateButtons(true, true, false);
            return;
        }

        const stepResult = simulation.executeNextStep();
        if (stepResult) {
            ui.refresh(stepResult);
            ui.updateButtons(true, stepResult.completed, simulation.autoPlayActive);
        } else if (simulation.completed) {
            ui.refresh();
            ui.updateButtons(true, true, false);
        }
    }

    /**
     * Inicia la simulación (primer paso)
     */
    function startSimulation() {
        if (simulation.started && !simulation.completed) return;

        simulation.reset();
        simulation.started = true;
        ui.refresh();
        executeStep(); // Ejecutar el paso 0
    }

    /**
     * Avanza un paso manualmente
     */
    function stepForward() {
        if (!simulation.started || simulation.completed) return;
        if (simulation.autoPlayActive) {
            simulation.stopAutoPlay();
            ui.updateButtons(true, simulation.completed, false);
            return; // Detener auto si se pulsa
        }
        executeStep();
    }

    /**
     * Alterna auto-play
     */
    function toggleAutoPlay() {
        if (simulation.completed) return;

        if (simulation.autoPlayActive) {
            simulation.stopAutoPlay();
            ui.updateButtons(true, simulation.completed, false);
            return;
        }

        const interval = parseInt(speedSlider.value, 10);
        simulation.startAutoPlay(interval, (stepResult) => {
            ui.refresh(stepResult);
            ui.updateButtons(true, stepResult.completed, false);

            if (stepResult.completed) {
                simulation.stopAutoPlay();
                ui.updateButtons(true, true, false);
                ui.refresh(stepResult);
            }
        });

        ui.updateButtons(true, simulation.completed, true);
    }

    /**
     * Reinicia todo
     */
    function resetSimulation() {
        simulation.reset();
        simulation.started = false;
        ui.resetBanner();
        ui.refresh();
        ui.updateButtons(false, false, false);
    }

    /**
     * Actualiza la etiqueta de velocidad
     */
    function updateSpeedLabel() {
        const val = parseInt(speedSlider.value, 10);
        speedValue.textContent = (val / 1000).toFixed(1) + 's';
    }

    /**
     * Cambia el escenario activo y reinicia la simulación
     * @param {'basic'|'pip'} scenario
     */
    function switchScenario(scenario) {
        simulation.stopAutoPlay();
        simulation.setScenario(scenario);
        simulation.reset();
        simulation.started = false;

        // Actualizar estado visual de las tabs
        tabBasic.classList.toggle('tab-active', scenario === 'basic');
        tabPIP.classList.toggle('tab-active', scenario === 'pip');

        ui.resetBanner();
        ui.refresh();
        ui.updateButtons(false, false, false);
    }

    // Event listeners
    btnStart.addEventListener('click', startSimulation);
    btnStep.addEventListener('click', stepForward);
    btnAuto.addEventListener('click', toggleAutoPlay);
    btnReset.addEventListener('click', resetSimulation);
    btnDownload.addEventListener('click', () => {
        ReportGenerator.download();
    });

    tabBasic.addEventListener('click', () => switchScenario('basic'));
    tabPIP.addEventListener('click', () => switchScenario('pip'));

    speedSlider.addEventListener('input', () => {
        updateSpeedLabel();
        // Si está en auto-play, reiniciar con nueva velocidad
        if (simulation.autoPlayActive) {
            simulation.stopAutoPlay();
            const interval = parseInt(speedSlider.value, 10);
            simulation.startAutoPlay(interval, (stepResult) => {
                ui.refresh(stepResult);
                ui.updateButtons(true, stepResult.completed, false);
                if (stepResult.completed) {
                    simulation.stopAutoPlay();
                    ui.updateButtons(true, true, false);
                }
            });
        }
    });

    // Inicializar UI al cargar
    updateSpeedLabel();
    ui.refresh();
    ui.updateButtons(false, false, false);

    console.log('🚀 Simulación RTOS cargada. Presiona "Iniciar Simulación" para comenzar.');
})();