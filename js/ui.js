/**
 * ui.js — Renderizado dinámico de la interfaz y manejo de banners explicativos
 * Actualiza las tarjetas de tareas, la cola de ready, CPU, semáforos, colas y log.
 */

class UI {
    constructor() {
        // Referencias a elementos del DOM
        this.taskContainer = document.getElementById('taskContainer');
        this.cpuSlot = document.getElementById('cpuSlot');
        this.readyQueue = document.getElementById('readyQueue');
        this.eventLog = document.getElementById('eventLog');
        this.semaphoreDisplay = document.getElementById('semaphoreDisplay');
        this.queueDisplay = document.getElementById('queueDisplay');
        this.contextSwitchIndicator = document.getElementById('contextSwitchIndicator');
        this.systemTickSpan = document.getElementById('systemTick');
        this.bannerTitle = document.getElementById('bannerTitle');
        this.bannerText = document.getElementById('bannerText');
        this.bannerStep = document.getElementById('bannerStep');
    }

    /**
     * Actualiza TODOS los componentes de la UI con el estado actual del kernel
     * @param {object|null} stepInfo - Información del paso actual de simulación (opcional)
     */
    refresh(stepInfo = null) {
        this.renderTasks();
        this.renderCPU();
        this.renderReadyQueue();
        this.renderSemaphores();
        this.renderMessageQueues();
        this.renderEventLog();
        this.updateSystemTick();
        this.updateContextSwitchIndicator();

        if (stepInfo) {
            this.updateBanner(stepInfo.title, stepInfo.description, stepInfo.step + 1, stepInfo.totalSteps);
        }
    }

    /**
     * Renderiza las tarjetas de las tareas (excepto IDLE)
     */
    renderTasks() {
        this.taskContainer.innerHTML = '';
        const tasksToShow = kernel.tasks.filter(t => t.id !== 'idle');
        tasksToShow.sort((a, b) => a.priority - b.priority);

        tasksToShow.forEach(task => {
            const card = document.createElement('div');
            card.className = `task-card state-${task.state.toLowerCase()}`;

            const stateClassMap = {
                'RUNNING': 'badge-running',
                'READY': 'badge-ready',
                'BLOCKED': 'badge-blocked',
                'SUSPENDED': 'badge-suspended'
            };
            const badgeClass = stateClassMap[task.state] || 'badge-ready';

            card.innerHTML = `
                <div class="task-header">
                    <span class="task-name">${task.name}</span>
                    <span class="task-priority">P: ${task.priority}</span>
                </div>
                <span class="task-state-badge ${badgeClass}">${task.state}</span>
                <div class="task-info">Ejecuciones: ${task.executionCount}</div>
                <div class="task-instruction">📎 ${task.currentInstruction}</div>
                ${task.blockedOn ? `<div class="task-info" style="color:var(--color-warning);">🔒 Bloqueado por: ${task.blockedOn}</div>` : ''}
            `;

            this.taskContainer.appendChild(card);
        });
    }

    /**
     * Muestra la tarea en ejecución en la ranura de la CPU
     */
    renderCPU() {
        const runningTask = kernel.runningTask;
        if (runningTask && runningTask.state === 'RUNNING') {
            this.cpuSlot.className = 'cpu-slot cpu-active';
            this.cpuSlot.innerHTML = `${runningTask.name} (P: ${runningTask.priority})`;
        } else {
            this.cpuSlot.className = 'cpu-slot empty-cpu';
            this.cpuSlot.innerHTML = '<span class="cpu-placeholder">IDLE / Sin tarea</span>';
        }
    }

    /**
     * Muestra las tareas en la cola de READY (todas las que están en estado READY)
     */
    renderReadyQueue() {
        const readyTasks = kernel.getReadyTasks();
        this.readyQueue.innerHTML = '';

        if (readyTasks.length === 0) {
            this.readyQueue.innerHTML = '<span class="empty-queue">Vacía</span>';
            return;
        }

        readyTasks.forEach(task => {
            const chip = document.createElement('span');
            chip.className = 'ready-chip';
            chip.textContent = `${task.name} (P:${task.priority})`;
            this.readyQueue.appendChild(chip);
        });
    }

    /**
     * Mostrar semáforos con indicadores de estado
     */
    renderSemaphores() {
        this.semaphoreDisplay.innerHTML = '<h3>🔐 Semáforos</h3>';
        if (kernel.semaphores.length === 0) {
            this.semaphoreDisplay.innerHTML += '<span style="font-size:0.75rem;color:var(--color-text-muted);">No hay semáforos creados</span>';
            return;
        }

        kernel.semaphores.forEach(sem => {
            const available = sem.isAvailable();
            const div = document.createElement('div');
            div.className = 'resource-item';
            div.innerHTML = `
                <span class="resource-indicator ${available ? 'resource-free' : 'resource-taken'}"></span>
                <strong>${sem.name}</strong>
                <span style="font-size:0.7rem;">(${sem.count}/${sem.maxCount})</span>
                <span style="font-size:0.65rem;color:var(--color-text-muted);">${available ? 'Libre' : 'Tomado'}</span>
                ${sem.waitingTasks.length > 0 ? `<span style="color:var(--color-warning);font-size:0.65rem;">⏳ ${sem.waitingTasks.length} esperando</span>` : ''}
            `;
            this.semaphoreDisplay.appendChild(div);
        });
    }

    /**
     * Mostrar colas de mensajes con contador
     */
    renderMessageQueues() {
        this.queueDisplay.innerHTML = '<h3>📬 Colas de Mensajes</h3>';
        if (kernel.messageQueues.length === 0) {
            this.queueDisplay.innerHTML += '<span style="font-size:0.75rem;color:var(--color-text-muted);">No hay colas creadas</span>';
            return;
        }

        kernel.messageQueues.forEach(q => {
            const div = document.createElement('div');
            div.className = 'resource-item';
            const count = q.getCount();
            div.innerHTML = `
                <span style="font-weight:bold;">${q.name}</span>
                <span style="font-size:0.75rem;">📦 ${count}/${q.capacity} mensajes</span>
                <span style="font-size:0.65rem;color:var(--color-text-muted);">${q.waitingReceivers.length} esperando recibir | ${q.waitingSenders.length} esperando enviar</span>
            `;
            this.queueDisplay.appendChild(div);
        });
    }

    /**
     * Renderiza el log de eventos (hasta 30 entradas recientes)
     */
    renderEventLog() {
        this.eventLog.innerHTML = '';
        const entries = kernel.eventLog.slice(-25); // Mostrar últimas 25 entradas

        entries.forEach(entry => {
            const div = document.createElement('div');
            div.className = `log-entry ${entry.type}-message`;
            div.innerHTML = `<span class="log-timestamp">[Tick ${entry.timestamp}]</span> ${entry.message}`;
            this.eventLog.appendChild(div);
        });

        // Auto-scroll al final
        this.eventLog.scrollTop = this.eventLog.scrollHeight;
    }

    /**
     * Actualiza el contador de tick del sistema
     */
    updateSystemTick() {
        this.systemTickSpan.textContent = kernel.systemTick;
    }

    /**
     * Muestra/oculta el indicador de cambio de contexto
     */
    updateContextSwitchIndicator() {
        if (kernel.contextSwitchOccurred) {
            this.contextSwitchIndicator.classList.remove('hidden');
            setTimeout(() => {
                this.contextSwitchIndicator.classList.add('hidden');
            }, 1800);
        }
    }

    /**
     * Actualiza el banner explicativo inferior
     * @param {string} title
     * @param {string} description
     * @param {number} currentStep
     * @param {number} totalSteps
     */
    updateBanner(title, description, currentStep, totalSteps) {
        this.bannerTitle.textContent = title;
        this.bannerText.innerHTML = description;
        this.bannerStep.textContent = `Paso ${currentStep}/${totalSteps}`;
    }

    /**
     * Restablece el banner a su estado inicial
     */
    resetBanner() {
        this.bannerTitle.textContent = 'Bienvenido a la simulación RTOS';
        this.bannerText.innerHTML = 'Presiona <strong>"Iniciar Simulación"</strong> para comenzar a explorar cómo funciona un sistema operativo de tiempo real. Observa cómo el planificador selecciona tareas según su prioridad, cómo se gestionan los semáforos y las colas de mensajes.';
        this.bannerStep.textContent = 'Paso 0/18';
    }

    /**
     * Actualiza el estado de los botones según la simulación
     */
    updateButtons(simStarted, simCompleted, autoPlayActive) {
        const btnStart = document.getElementById('btnStart');
        const btnStep = document.getElementById('btnStep');
        const btnAuto = document.getElementById('btnAuto');
        const btnReset = document.getElementById('btnReset');
        const btnDownload = document.getElementById('btnDownload');

        btnStart.disabled = simStarted && !simCompleted;
        btnStep.disabled = !simStarted || simCompleted || autoPlayActive;
        btnAuto.disabled = !simStarted || simCompleted;
        btnDownload.disabled = !simCompleted;

        if (autoPlayActive) {
            btnAuto.textContent = '⏹️ Detener Auto-Play';
            btnAuto.classList.add('btn-danger');
        } else {
            btnAuto.textContent = '🔄 Auto-Play';
            btnAuto.classList.remove('btn-danger');
        }
    }
}

const ui = new UI();