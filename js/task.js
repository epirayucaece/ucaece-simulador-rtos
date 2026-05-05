/**
 * task.js — Clase Task que representa una tarea del RTOS
 * Cada tarea tiene un TCB (Task Control Block) simulado.
 */

class Task {
    /**
     * @param {string} id - Identificador único
     * @param {string} name - Nombre descriptivo
     * @param {number} priority - Prioridad (0 = máxima, siguiendo FreeRTOS)
     * @param {string} description - Descripción de lo que hace la tarea
     */
    constructor(id, name, priority, description) {
        this.id = id;
        this.name = name;
        this.priority = priority;
        this.description = description;

        /**
         * Estado actual de la tarea:
         * 'READY' | 'RUNNING' | 'BLOCKED' | 'SUSPENDED'
         */
        this.state = 'READY';

        /** @type {number} Contador de ejecuciones (cuántos ticks ha ejecutado) */
        this.executionCount = 0;

        /** @type {string} Instrucción actual que está ejecutando */
        this.currentInstruction = 'Esperando...';

        /** @type {string|null} Recurso por el cual está bloqueada (si aplica) */
        this.blockedOn = null;

        /**
         * Prioridad original antes de que el PIP la eleve temporalmente.
         * null indica que no hay herencia de prioridad activa.
         * @type {number|null}
         */
        this.originalPriority = null;

        /** @type {number} Tick en el que fue creada */
        this.createdAt = 0;

        /** @type {number} Tick en el que cambió de estado por última vez */
        this.lastStateChange = 0;
    }

    /**
     * Cambia el estado de la tarea
     * @param {'READY'|'RUNNING'|'BLOCKED'|'SUSPENDED'} newState
     * @param {string} reason - Razón del cambio (para logging)
     */
    setState(newState, reason = '') {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = kernel.systemTick;

        if (reason) {
            kernel.logEvent(
                newState === 'BLOCKED' ? 'block' :
                newState === 'RUNNING' ? 'task' : 'system',
                `📌 Tarea "${this.name}": ${oldState} → ${newState} | ${reason}`
            );
        }
    }

    /**
     * Establece la instrucción actual que la tarea está ejecutando
     * @param {string} instruction
     */
    setInstruction(instruction) {
        this.currentInstruction = instruction;
    }

    /**
     * Incrementa el contador de ejecución
     */
    incrementExecution() {
        this.executionCount++;
    }

    /**
     * Retorna un resumen del TCB para mostrar en UI
     * @returns {object}
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            priority: this.priority,
            state: this.state,
            instruction: this.currentInstruction,
            executionCount: this.executionCount,
            blockedOn: this.blockedOn
        };
    }
}