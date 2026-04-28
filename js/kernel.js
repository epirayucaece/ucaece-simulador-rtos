/**
 * kernel.js — Núcleo del RTOS simulado
 * Mantiene el estado global del sistema: tareas, tick, recursos.
 * Sigue el patrón de FreeRTOS con prioridades donde 0 = máxima prioridad.
 */

class Kernel {
    constructor() {
        /** @type {Task[]} Lista completa de tareas del sistema */
        this.tasks = [];

        /** @type {Task|null} Tarea actualmente en ejecución */
        this.runningTask = null;

        /** @type {number} Tick actual del sistema (reloj del RTOS) */
        this.systemTick = 0;

        /** @type {Semaphore[]} Semáforos del sistema */
        this.semaphores = [];

        /** @type {MessageQueue[]} Colas de mensajes del sistema */
        this.messageQueues = [];

        /** @type {string[]} Log de eventos para la UI */
        this.eventLog = [];

        /** @type {boolean} Indica si hubo cambio de contexto en el último tick */
        this.contextSwitchOccurred = false;

        /** @type {Task|null} Tarea que fue desalojada en el último cambio */
        this.preemptedTask = null;
    }

    /**
     * Inicializa el kernel con la configuración base
     */
    initialize() {
        this.systemTick = 0;
        this.runningTask = null;
        this.eventLog = [];
        this.contextSwitchOccurred = false;
        this.preemptedTask = null;
        this.logEvent('system', '🟢 Kernel RTOS inicializado. Tick del sistema: 0');
    }

    /**
     * Registra un evento en el log
     * @param {'system'|'scheduler'|'task'|'block'|'preemption'} type
     * @param {string} message
     */
    logEvent(type, message) {
        const timestamp = this.systemTick;
        this.eventLog.push({
            type,
            message,
            timestamp,
            id: Date.now() + Math.random()
        });
    }

    /**
     * Incrementa el tick del sistema (simula interrupción del timer)
     */
    tick() {
        this.systemTick++;
        this.contextSwitchOccurred = false;
        this.preemptedTask = null;
    }

    /**
     * Obtiene las tareas en estado READY ordenadas por prioridad (0 primero)
     * @returns {Task[]}
     */
    getReadyTasks() {
        return this.tasks
            .filter(t => t.state === 'READY')
            .sort((a, b) => a.priority - b.priority);
    }

    /**
     * Encuentra una tarea por su ID
     * @param {string} id
     * @returns {Task|undefined}
     */
    getTaskById(id) {
        return this.tasks.find(t => t.id === id);
    }
}

// Exportar como variable global para los otros módulos
const kernel = new Kernel();