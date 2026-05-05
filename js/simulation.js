/**
 * simulation.js — Controlador de la simulación paso a paso
 * Contiene el guion de eventos que demuestra los principios clave de un RTOS:
 * - Scheduling por prioridad
 * - Preempción
 * - Semáforos (bloqueo/desbloqueo)
 * - Colas de mensajes
 * - Cambio de contexto
 * - Tarea IDLE
 */

class Simulation {
    constructor() {
        /** @type {number} Paso actual de la simulación */
        this.currentStep = -1;

        /** @type {boolean} Simulación iniciada */
        this.started = false;

        /** @type {boolean} Simulación completada */
        this.completed = false;

        /** @type {number|null} ID del intervalo de auto-play */
        this.autoPlayInterval = null;

        /** @type {boolean} Modo auto-play activo */
        this.autoPlayActive = false;

        /**
         * Escenario activo: 'basic' = scheduling/semáforos/colas
         *                   'pip'   = inversión de prioridad + mutex + PIP
         * @type {'basic'|'pip'}
         */
        this.scenario = 'basic';

        /**
         * Guion de pasos de la simulación.
         * Cada paso tiene: title, description, y una función action()
         * que modifica el estado del kernel.
         */
        this.steps = [];
        this.buildSteps();
    }

    /**
     * Cambia el escenario activo y reconstruye los pasos.
     * @param {'basic'|'pip'} scenario
     */
    setScenario(scenario) {
        this.scenario = scenario;
        this.buildSteps();
    }

    /**
     * Construye el guion según el escenario activo
     */
    buildSteps() {
        this.steps = this.scenario === 'pip'
            ? this.buildPIPSteps()
            : this.buildBasicSteps();
    }

    /**
     * Escenario básico: scheduling por prioridad, semáforos y colas de mensajes
     */
    buildBasicSteps() {
        return [
            // Paso 0: Inicialización
            {
                title: '🔧 Inicialización del Sistema',
                description: 'El RTOS arranca. Se crean 5 tareas con distintas prioridades (0=máxima prioridad, como en FreeRTOS). Todas las tareas pasan al estado <strong>READY</strong>. El planificador aún no ha seleccionado ninguna para ejecutar. Observa la cola de tareas listas ordenadas por prioridad.',
                action: () => {
                    kernel.initialize();
                    kernel.tasks = [];
                    kernel.semaphores = [];
                    kernel.messageQueues = [];
                    this.createTasks();
                    this.createResources();
                    kernel.logEvent('system', '🔧 Sistema inicializado. 5 tareas creadas, todas en estado READY.');
                    kernel.logEvent('system', '📋 Cola de READY: ' + kernel.getReadyTasks().map(t => t.name + '(P' + t.priority + ')').join(', '));
                }
            },

            // Paso 1: Primer scheduling
            {
                title: '🎯 Primer Scheduling: El Planificador Elige',
                description: 'El <strong>scheduler</strong> evalúa la cola de tareas READY y selecciona la de <strong>mayor prioridad</strong>. La <strong>Tarea A (Control Motor, prioridad 0)</strong> es la más prioritaria. Pasa a estado <strong>RUNNING</strong> y ocupa la CPU.',
                action: () => {
                    kernel.tick();
                    const result = scheduler.schedule();
                    kernel.logEvent('scheduler', `🎯 Planificador: ${result.reason}`);
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Inicializando control del motor...');
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 2: Tarea A adquiere semáforo
            {
                title: '🔒 Adquisición de Semáforo (Recurso Compartido)',
                description: 'La <strong>Tarea A</strong> necesita acceder a un recurso protegido por el <strong>semáforo binario "I2C_Bus"</strong>. Como está disponible, lo adquiere exitosamente y continúa ejecutando. El semáforo pasa a estado TOMADO (🔴).',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskA && semI2C && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Adquiriendo semáforo I2C_Bus...');
                        semI2C.acquire(taskA);
                        taskA.setInstruction('Ejecutando sección crítica (I2C_Bus tomado)');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 3: Tarea B intenta adquirir el mismo semáforo
            {
                title: '⛔ Intento Fallido de Adquisición — Bloqueo',
                description: 'La <strong>Tarea B (Sensor, prioridad 1)</strong> también necesita el bus I2C. Como el semáforo está tomado por la Tarea A, la <strong>Tarea B se BLOQUEA</strong> y pasa al estado BLOCKED, esperando que el semáforo se libere. La Tarea A (prioridad 0) sigue ejecutando porque tiene mayor prioridad.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskB && semI2C && taskB.state === 'READY') {
                        taskB.setInstruction('Intentando adquirir semáforo I2C_Bus...');
                        const acquired = semI2C.acquire(taskB);
                        if (!acquired) {
                            taskB.setInstruction('Esperando semáforo I2C_Bus...');
                        }
                    }
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Sección crítica en progreso...');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 4: Tarea A libera el semáforo — Tarea B se desbloquea
            {
                title: '🔓 Liberación de Semáforo y Desbloqueo',
                description: 'La <strong>Tarea A</strong> completa su sección crítica y <strong>libera el semáforo I2C_Bus</strong>. Inmediatamente, la <strong>Tarea B se desbloquea</strong> y adquiere el semáforo. Como la Tarea A (prioridad 0) sigue siendo más prioritaria que la Tarea B (prioridad 1), <strong>no hay preempción</strong>. La Tarea B queda en READY.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const semI2C = kernel.semaphores.find(s => s.id === 'sem_i2c');
                    if (taskA && semI2C && taskA.state === 'RUNNING') {
                        taskA.setInstruction('Liberando semáforo I2C_Bus...');
                        semI2C.release(taskA);
                        taskA.setInstruction('Sección crítica completada. Continúa ejecutando.');
                        taskA.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 5: Tarea A se bloquea (delay voluntario) — Tarea B toma CPU
            {
                title: '🔄 Tarea A se Bloquea — Cambio de Contexto',
                description: 'La <strong>Tarea A</strong> completa su trabajo crítico y se bloquea voluntariamente (simulando una espera por evento). El <strong>scheduler</strong> selecciona ahora a la <strong>Tarea B (prioridad 1)</strong>, que es la más prioritaria entre las READY. Ocurre un <strong>cambio de contexto</strong>.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setState('BLOCKED', 'Esperando evento externo (delay voluntario)');
                        taskA.blockedOn = 'event_delay';
                        taskA.setInstruction('Esperando evento...');
                    }
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                    if (result.selectedTask && result.selectedTask.id !== 'task_a') {
                        result.selectedTask.setInstruction('¡CPU asignada! Iniciando lectura de sensor...');
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 6: Tarea B envía mensaje por cola
            {
                title: '📨 Comunicación por Cola de Mensajes',
                description: 'La <strong>Tarea B</strong> necesita enviar datos a la <strong>Tarea C (Comunicación)</strong>. Usa la <strong>cola de mensajes "SensorData"</strong>. El mensaje se encola exitosamente. Las colas son el mecanismo principal de comunicación entre tareas en un RTOS.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const queueSensor = kernel.messageQueues.find(q => q.id === 'q_sensor');
                    if (taskB && taskB.state === 'RUNNING' && queueSensor) {
                        taskB.setInstruction('Enviando datos del sensor por cola...');
                        queueSensor.send({ type: 'sensor_reading', value: 42.5, unit: '°C' }, taskB);
                        taskB.setInstruction('Datos enviados. Continuando...');
                        taskB.incrementExecution();
                    }
                    scheduler.schedule();
                }
            },

            // Paso 7: Tarea B se bloquea esperando confirmación — Tarea C toma CPU
            {
                title: '📭 Tarea B Espera Respuesta — Nuevo Cambio de Contexto',
                description: 'La <strong>Tarea B</strong> se bloquea esperando una confirmación por otra cola. El scheduler selecciona a la <strong>Tarea C (prioridad 2)</strong>. La Tarea C recibe el mensaje pendiente de la cola "SensorData".',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    const queueAck = kernel.messageQueues.find(q => q.id === 'q_ack');
                    if (taskB && taskB.state === 'RUNNING' && queueAck) {
                        taskB.setInstruction('Esperando confirmación (ACK)...');
                        queueAck.receive(taskB); // Se bloqueará porque la cola está vacía
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask && result.selectedTask.id === 'task_c') {
                        const queueSensor = kernel.messageQueues.find(q => q.id === 'q_sensor');
                        result.selectedTask.setInstruction('Recibiendo datos de cola SensorData...');
                        const msg = queueSensor ? queueSensor.receive(result.selectedTask) : null;
                        if (msg) {
                            result.selectedTask.setInstruction(`Procesando: ${msg.content.value}${msg.content.unit}`);
                        }
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                }
            },

            // Paso 8: Tarea C envía confirmación — Tarea B se desbloquea ¡Preempción!
            {
                title: '⚡ Preempción por Prioridad',
                description: 'La <strong>Tarea C</strong> envía la confirmación por la cola "ACK", lo que <strong>desbloquea a la Tarea B (prioridad 1)</strong>. Como la Tarea B tiene <strong>mayor prioridad</strong> que la Tarea C (prioridad 2), el scheduler <strong>desaloja a C y ejecuta B</strong>. ¡Esto es <strong>PREEMPCIÓN</strong>!',
                action: () => {
                    kernel.tick();
                    const taskC = kernel.getTaskById('task_c');
                    const queueAck = kernel.messageQueues.find(q => q.id === 'q_ack');
                    const taskB = kernel.getTaskById('task_b');
                    if (taskC && taskC.state === 'RUNNING' && queueAck) {
                        taskC.setInstruction('Enviando confirmación (ACK)...');
                        queueAck.send({ type: 'ack', status: 'ok' }, taskC);
                        taskC.setInstruction('ACK enviado.');
                        taskC.incrementExecution();
                    }
                    // Al desbloquearse B, el scheduler debe reevaluar
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `⚡ ${result.reason}`);
                    if (result.preempted && result.selectedTask) {
                        result.selectedTask.setInstruction('¡CPU recuperada! Recibiendo confirmación...');
                        const msg = queueAck ? queueAck.receive(result.selectedTask) : null;
                        if (msg) {
                            result.selectedTask.setInstruction(`Confirmación recibida: ${msg.content.status}`);
                        }
                        result.selectedTask.incrementExecution();
                    }
                }
            },

            // Paso 9: Tarea B completa — Tarea C reanuda
            {
                title: '✅ Tarea B Completa — Tarea C Reanuda',
                description: 'La <strong>Tarea B</strong> finaliza su trabajo y se bloquea en espera del próximo ciclo. El scheduler restaura a la <strong>Tarea C (prioridad 2)</strong>, que continúa desde donde fue interrumpida.',
                action: () => {
                    kernel.tick();
                    const taskB = kernel.getTaskById('task_b');
                    if (taskB && taskB.state === 'RUNNING') {
                        taskB.setState('BLOCKED', 'Ciclo completado, esperando próximo periodo');
                        taskB.blockedOn = 'periodic_wait';
                        taskB.setInstruction('Esperando próximo ciclo...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Reanudando procesamiento...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `✅ ${result.reason}`);
                }
            },

            // Paso 10: Tarea C completa — Tarea D toma CPU
            {
                title: '📋 Tarea de Baja Prioridad Toma la CPU',
                description: 'Con las tareas de alta prioridad bloqueadas, el scheduler selecciona a la <strong>Tarea D (Interfaz, prioridad 3)</strong>. En un RTOS, las tareas de baja prioridad solo ejecutan cuando las de alta prioridad están bloqueadas.',
                action: () => {
                    kernel.tick();
                    const taskC = kernel.getTaskById('task_c');
                    if (taskC && taskC.state === 'RUNNING') {
                        taskC.setState('BLOCKED', 'Procesamiento completado');
                        taskC.blockedOn = 'completed';
                        taskC.setInstruction('Completado.');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Actualizando interfaz de usuario...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `📋 ${result.reason}`);
                }
            },

            // Paso 11: Tarea A se reactiva — Preempción de D
            {
                title: '⚡ Reactivación y Preempción — Tarea Crítica Despierta',
                description: 'La <strong>Tarea A (prioridad 0)</strong> se reactiva (el evento que esperaba ocurre). Como tiene <strong>máxima prioridad</strong>, el scheduler <strong>desaloja inmediatamente a la Tarea D</strong>. Esto demuestra que en un RTOS, las tareas críticas siempre obtienen la CPU cuando la necesitan.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'BLOCKED') {
                        taskA.setState('READY', 'Evento externo recibido, reactivando tarea crítica');
                        taskA.blockedOn = null;
                        taskA.setInstruction('Reactivada. Necesita CPU urgentemente.');
                    }
                    const result = scheduler.reschedule();
                    if (result.preempted && result.selectedTask) {
                        result.selectedTask.setInstruction('Ejecutando tarea crítica urgente...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('preemption', `⚡ ${result.reason}`);
                }
            },

            // Paso 12: Tarea A completa su ráfaga — D reanuda
            {
                title: '🔄 Tarea Crítica Completa — Tarea D Reanuda',
                description: 'La <strong>Tarea A</strong> completa su trabajo urgente y se bloquea de nuevo. El scheduler restaura a la <strong>Tarea D</strong> para que continúe su trabajo de baja prioridad. Así funciona la <strong>ejecución en ráfagas</strong> típica de RTOS.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    if (taskA && taskA.state === 'RUNNING') {
                        taskA.setState('BLOCKED', 'Trabajo urgente completado, volviendo a esperar');
                        taskA.blockedOn = 'event_delay';
                        taskA.setInstruction('Esperando próximo evento...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Reanudando interfaz de usuario...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `🔄 ${result.reason}`);
                }
            },

            // Paso 13: Tarea D completa — Tarea E (mínima prioridad)
            {
                title: '📝 Tarea de Fondo (Logger) Toma la CPU',
                description: 'La <strong>Tarea D</strong> finaliza. Ahora solo queda la <strong>Tarea E (Logger, prioridad 4)</strong> en estado READY. Las tareas de logging y mantenimiento suelen tener la prioridad más baja en un RTOS.',
                action: () => {
                    kernel.tick();
                    const taskD = kernel.getTaskById('task_d');
                    if (taskD && taskD.state === 'RUNNING') {
                        taskD.setState('BLOCKED', 'Interfaz actualizada, esperando cambios');
                        taskD.blockedOn = 'ui_idle';
                        taskD.setInstruction('Esperando interacción...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Escribiendo logs del sistema...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('scheduler', `📝 ${result.reason}`);
                }
            },

            // Paso 14: Tarea E completa — Todas bloqueadas — IDLE
            {
                title: '😴 Todas las Tareas Bloqueadas — Entra IDLE',
                description: 'La <strong>Tarea E</strong> completa su logging y se bloquea. <strong>No hay tareas READY</strong>. El scheduler activa la <strong>tarea IDLE</strong>, una tarea especial de mínima prioridad que ejecuta cuando el sistema está ocioso. En FreeRTOS, esta tarea se llama <code>prvIdleTask</code>.',
                action: () => {
                    kernel.tick();
                    const taskE = kernel.getTaskById('task_e');
                    if (taskE && taskE.state === 'RUNNING') {
                        taskE.setState('BLOCKED', 'Logging completado, esperando nuevo ciclo');
                        taskE.blockedOn = 'periodic_log';
                        taskE.setInstruction('Esperando próximo ciclo de log...');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask && result.selectedTask.id === 'idle') {
                        result.selectedTask.setInstruction('Sistema ocioso. IDLE ejecutando...');
                    }
                    kernel.logEvent('system', `😴 ${result.reason}`);
                }
            },

            // Paso 15: Desbloqueo múltiple — Tareas vuelven a READY
            {
                title: '🌟 Reactivación de Tareas — El Sistema Despierta',
                description: 'Varias tareas se reactivan al cumplirse sus tiempos de espera. La <strong>Tarea A (prioridad 0)</strong> y la <strong>Tarea B (prioridad 1)</strong> pasan a READY. El scheduler inmediatamente selecciona a la <strong>Tarea A</strong> por tener la máxima prioridad.',
                action: () => {
                    kernel.tick();
                    const taskA = kernel.getTaskById('task_a');
                    const taskB = kernel.getTaskById('task_b');
                    if (taskA && taskA.state === 'BLOCKED') {
                        taskA.setState('READY', 'Timeout cumplido, reactivando');
                        taskA.blockedOn = null;
                        taskA.setInstruction('Lista para ejecutar.');
                    }
                    if (taskB && taskB.state === 'BLOCKED') {
                        taskB.setState('READY', 'Periodo cumplido, reactivando');
                        taskB.blockedOn = null;
                        taskB.setInstruction('Lista para ejecutar.');
                    }
                    const result = scheduler.reschedule();
                    if (result.selectedTask) {
                        result.selectedTask.setInstruction('Ejecutando tarea de máxima prioridad...');
                        result.selectedTask.incrementExecution();
                    }
                    kernel.logEvent('system', `🌟 ${result.reason}`);
                }
            },

            // Paso 16: Simulación completada
            {
                title: '🏁 Ciclo Completo — Resumen del RTOS',
                description: 'La simulación ha demostrado los <strong>principios fundamentales</strong> de un RTOS: <br>✅ <strong>Scheduling por prioridad</strong> (0=máxima)<br>✅ <strong>Preempción</strong> cuando una tarea de mayor prioridad se desbloquea<br>✅ <strong>Semáforos</strong> para acceso exclusivo a recursos<br>✅ <strong>Colas de mensajes</strong> para comunicación entre tareas<br>✅ <strong>Cambio de contexto</strong> entre tareas<br>✅ <strong>Tarea IDLE</strong> cuando no hay trabajo pendiente<br><br>Estos conceptos son la base de sistemas como <strong>FreeRTOS, QNX, VxWorks</strong> y se estudian en los libros de <strong>Tanenbaum</strong> y <strong>Silberschatz</strong>.',
                action: () => {
                    kernel.tick();
                    kernel.logEvent('system', '🏁 Simulación completada. Todos los conceptos clave de RTOS demostrados.');
                    kernel.logEvent('system', '📚 Referencias: Tanenbaum "Sistemas Operativos Modernos", Silberschatz "Operating System Concepts", FreeRTOS Reference Manual, QNX Neutrino RTOS.');
                    this.completed = true;
                }
            }
        ];
    }

    /**
     * Escenario PIP: inversión de prioridad no acotada resuelta con mutex + PIP.
     *
     * Actores:
     *   TL (prioridad 3 — baja): toma el mutex primero.
     *   TH (prioridad 1 — alta): llega después, necesita el mutex → PIP eleva a TL.
     *   TM (prioridad 2 — media): intenta preemptar a TL pero no puede gracias al PIP.
     *
     * Sin PIP: TM preemptaría a TL indefinidamente → TH esperaría tiempo no acotado.
     * Con PIP: TL hereda la prioridad de TH → TM no puede interrumpir → TL libera
     *          rápidamente → TH obtiene el mutex → inversión acotada al tiempo de la
     *          sección crítica de TL.
     *
     * Referencia: Silberschatz (2006, p.647), González Harbour (2001).
     */
    buildPIPSteps() {
        return [
            // Paso 0: Inicialización
            {
                title: '🔧 Inicialización — Escenario Inversión de Prioridad',
                description:
                    'Se crean <strong>3 tareas</strong> para demostrar la inversión de prioridad y su solución:<br><br>' +
                    '🔴 <strong>TL — Tarea Baja (prioridad 3)</strong>: única en READY al inicio. Tomará el mutex.<br>' +
                    '🟡 <strong>TM — Tarea Media (prioridad 2)</strong>: bloqueada, activará después.<br>' +
                    '🟢 <strong>TH — Tarea Alta (prioridad 1)</strong>: bloqueada, activará después y necesitará el mutex.<br><br>' +
                    'Se crea un <strong>mutex "RecursoCompartido"</strong> (no un semáforo): tiene propietario y soporta PIP.',
                action: () => {
                    kernel.initialize();
                    kernel.tasks = [];
                    kernel.semaphores = [];
                    kernel.messageQueues = [];
                    kernel.mutexes = [];

                    const taskTL = new Task('tl', 'TL — Tarea Baja (p:3)', 3,
                        'Tarea de baja prioridad. Tomará el mutex primero.');
                    const taskTM = new Task('tm', 'TM — Tarea Media (p:2)', 2,
                        'Tarea de prioridad media. Intentará preemptar a TL.');
                    const taskTH = new Task('th', 'TH — Tarea Alta (p:1)', 1,
                        'Tarea de alta prioridad. Necesitará el mutex que tiene TL.');

                    // TM y TH comienzan bloqueadas (sus eventos aún no ocurrieron)
                    taskTM.state = 'BLOCKED';
                    taskTM.blockedOn = 'evento_tm';
                    taskTM.setInstruction('Esperando evento de activación...');
                    taskTH.state = 'BLOCKED';
                    taskTH.blockedOn = 'evento_th';
                    taskTH.setInstruction('Esperando evento de activación...');

                    [taskTL, taskTM, taskTH].forEach(t => {
                        t.createdAt = kernel.systemTick;
                        t.lastStateChange = kernel.systemTick;
                        kernel.tasks.push(t);
                    });

                    const idleTask = new Task('idle', 'IDLE Task', 99, 'Tarea ociosa del sistema.');
                    idleTask.state = 'READY';
                    kernel.tasks.push(idleTask);
                    scheduler.setIdleTask(idleTask);

                    kernel.mutexes.push(new Mutex('mutex_shared', 'RecursoCompartido'));

                    kernel.logEvent('system', '🔧 Escenario PIP listo. TL en READY. TH y TM bloqueadas.');
                    kernel.logEvent('system', '📋 Solo TL está READY. Cola: TL(p:3). TH y TM esperan sus eventos.');
                }
            },

            // Paso 1: Scheduler selecciona TL
            {
                title: '🎯 Scheduler Selecciona TL — Única Tarea READY',
                description:
                    'Solo <strong>TL (prioridad 3)</strong> está en READY. El scheduler la selecciona. ' +
                    'TH y TM siguen bloqueadas esperando sus eventos.<br><br>' +
                    'TL va a acceder a un recurso compartido protegido por <strong>mutex</strong>. ' +
                    'Nota: se usa <strong>mutex</strong> (no semáforo binario) porque necesitamos ' +
                    'rastrear la propiedad para poder aplicar PIP.',
                action: () => {
                    kernel.tick();
                    const result = scheduler.schedule();
                    kernel.logEvent('scheduler', `🎯 ${result.reason}`);
                    const taskTL = kernel.getTaskById('tl');
                    if (taskTL && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction('Iniciando trabajo. Accederé al recurso compartido...');
                        taskTL.incrementExecution();
                    }
                }
            },

            // Paso 2: TL adquiere el mutex
            {
                title: '🔑 TL Adquiere el Mutex — Entra a Sección Crítica',
                description:
                    '<strong>TL</strong> solicita el mutex <strong>"RecursoCompartido"</strong>. ' +
                    'Como está libre, lo adquiere y se convierte en <strong>propietaria</strong>.<br><br>' +
                    '🔑 <strong>Diferencia clave Mutex vs Semáforo</strong>:<br>' +
                    'El mutex registra quién lo tomó. Solo TL podrá liberarlo. ' +
                    'Esta propiedad es esencial para que el PIP funcione: el kernel sabe ' +
                    'a quién elevarle la prioridad cuando llegue TH.',
                action: () => {
                    kernel.tick();
                    const taskTL = kernel.getTaskById('tl');
                    const mutex = kernel.mutexes.find(m => m.id === 'mutex_shared');
                    if (taskTL && mutex && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction('Adquiriendo mutex RecursoCompartido...');
                        mutex.acquire(taskTL);
                        taskTL.setInstruction('Mutex adquirido. Ejecutando sección crítica...');
                        taskTL.incrementExecution();
                    }
                }
            },

            // Paso 3: TH llega — preempta TL — intenta mutex — BLOCKED — PIP actúa
            {
                title: '⚡ TH Llega → Preempta TL → Mutex Bloqueado → 🔺 PIP ACTÚA',
                description:
                    '<strong>TH (prioridad 1)</strong> recibe su evento y pasa a READY. ' +
                    'Como TH tiene mayor prioridad que TL (p:3), el scheduler <strong>preempta a TL</strong>.<br><br>' +
                    'TH intenta adquirir el mutex → está tomado por TL → <strong>TH se BLOQUEA</strong>.<br><br>' +
                    '🔺 <strong>¡PROTOCOLO DE HERENCIA DE PRIORIDAD (PIP)!</strong><br>' +
                    'El kernel detecta que TH (p:1) espera un mutex que posee TL (p:3). ' +
                    'Eleva temporalmente la prioridad de TL a <strong>1</strong> (la de TH). ' +
                    'TL pasa a ejecutar con prioridad heredada, protegida de interrupciones de TM.',
                action: () => {
                    kernel.tick();
                    const taskTH = kernel.getTaskById('th');
                    const taskTL = kernel.getTaskById('tl');
                    const mutex = kernel.mutexes.find(m => m.id === 'mutex_shared');

                    // TH se activa
                    if (taskTH && taskTH.state === 'BLOCKED') {
                        taskTH.setState('READY', 'Evento recibido: TH pasa a READY');
                        taskTH.blockedOn = null;
                        taskTH.setInstruction('¡Evento recibido! Necesito el mutex urgentemente...');
                    }

                    // TH preempta a TL
                    const result1 = scheduler.schedule();
                    kernel.logEvent('scheduler', `⚡ ${result1.reason}`);

                    // TH intenta adquirir mutex — PIP se activa aquí
                    if (taskTH && taskTH.state === 'RUNNING' && mutex) {
                        taskTH.setInstruction('Intentando adquirir mutex RecursoCompartido...');
                        mutex.acquire(taskTH); // → TH BLOCKED, PIP eleva TL
                        taskTH.setInstruction('Bloqueada esperando mutex. PIP elevó prioridad de TL...');
                    }

                    // Re-evaluar: TL (ahora con prioridad heredada 1) debería retomar CPU
                    const result2 = scheduler.reschedule();
                    kernel.logEvent('scheduler', `🔄 Tras PIP → ${result2.reason}`);
                    if (taskTL && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction(
                            `Reanuda con prioridad HEREDADA ${taskTL.priority} (original: 3). ` +
                            `Completando sección crítica rápidamente...`
                        );
                    }
                }
            },

            // Paso 4: TM llega — intenta preemptar — NO PUEDE (PIP activo)
            {
                title: '🛡️ TM Llega — Intenta Preemptar TL — FALLA por PIP',
                description:
                    '<strong>TM (prioridad 2)</strong> recibe su evento y pasa a READY. ' +
                    'Sin PIP, TM preemptaría a TL (p:3) y la bloquearía indefinidamente.<br><br>' +
                    '🛡️ <strong>PIP en acción</strong>: TL ejecuta con prioridad heredada <strong>1</strong>. ' +
                    'La prioridad 2 de TM es <strong>menor</strong> que 1, por lo que TM ' +
                    '<strong>NO PUEDE preemptar</strong> a TL. TM queda en READY esperando.<br><br>' +
                    '⚠️ <strong>Sin PIP</strong>: TM habría preemptado a TL, TH habría esperado ' +
                    'todo el tiempo de ejecución de TM — inversión de prioridad <em>no acotada</em>.',
                action: () => {
                    kernel.tick();
                    const taskTM = kernel.getTaskById('tm');
                    const taskTL = kernel.getTaskById('tl');

                    // TM se activa
                    if (taskTM && taskTM.state === 'BLOCKED') {
                        taskTM.setState('READY', 'Evento recibido: TM pasa a READY');
                        taskTM.blockedOn = null;
                        taskTM.setInstruction('Quiero la CPU... pero el PIP me lo impide.');
                    }

                    // El scheduler evalúa: TL (p:1 heredada) vs TM (p:2) → TL gana
                    const result = scheduler.schedule();
                    kernel.logEvent('pip',
                        `🛡️ TM (p:2) NO puede preemptar a TL (p:${taskTL ? taskTL.priority : '?'} heredada por PIP). ` +
                        `Sin PIP, TM habría interrumpido a TL indefinidamente.`
                    );
                    kernel.logEvent('scheduler', result.reason);

                    if (taskTL && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction('Completando sección crítica. TM no puede interrumpirme (PIP activo).');
                        taskTL.incrementExecution();
                    }
                }
            },

            // Paso 5: TL libera mutex — PIP restaurado — TH toma mutex y preempta
            {
                title: '🔓 TL Libera Mutex → 🔻 PIP Restaurado → TH Toma el Control',
                description:
                    '<strong>TL</strong> completa su sección crítica y <strong>libera el mutex</strong>.<br><br>' +
                    '🔻 <strong>PIP RESTAURADO</strong>: La prioridad de TL vuelve a <strong>3</strong> (su valor original).<br><br>' +
                    'El mutex pasa a <strong>TH</strong> (la tarea de mayor prioridad en espera). ' +
                    'TH pasa a READY con el mutex. Como TH (p:1) ahora tiene mayor prioridad ' +
                    'que TL (p:3 restaurada), el scheduler <strong>preempta a TL</strong> y TH toma la CPU. ' +
                    'La inversión de prioridad quedó <strong>acotada</strong> al tiempo de la sección crítica de TL.',
                action: () => {
                    kernel.tick();
                    const taskTL = kernel.getTaskById('tl');
                    const mutex = kernel.mutexes.find(m => m.id === 'mutex_shared');

                    if (taskTL && mutex && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction('Liberando mutex RecursoCompartido...');
                        mutex.release(taskTL); // → PIP restaurado, TH desbloquea
                        taskTL.setInstruction('Mutex liberado. Prioridad restaurada a 3.');
                    }

                    // TH (p:1) ahora en READY → preempta a TL (p:3 restaurada)
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `⚡ ${result.reason}`);
                    const taskTH = kernel.getTaskById('th');
                    if (taskTH && taskTH.state === 'RUNNING') {
                        taskTH.setInstruction('¡Mutex adquirido! Ejecutando sección crítica de alta prioridad...');
                        taskTH.incrementExecution();
                    }
                }
            },

            // Paso 6: TH completa — TM obtiene CPU
            {
                title: '✅ TH Completa — TM Obtiene la CPU',
                description:
                    '<strong>TH</strong> completa su trabajo crítico y se bloquea. ' +
                    'Ahora <strong>TM (prioridad 2)</strong> es la siguiente en READY. ' +
                    'El scheduler le asigna la CPU.<br><br>' +
                    '📊 <strong>Orden de ejecución con PIP</strong>: TL (sección crítica) → TH → TM → TL (resto)<br>' +
                    '📊 <strong>Sin PIP habría sido</strong>: TL → TM (interrupción larga) → TL → TH (tardía)<br><br>' +
                    'El PIP garantizó que TH (alta prioridad) no fuera bloqueada por TM (media prioridad).',
                action: () => {
                    kernel.tick();
                    const taskTH = kernel.getTaskById('th');
                    if (taskTH && taskTH.state === 'RUNNING') {
                        taskTH.setState('BLOCKED', 'Trabajo crítico completado');
                        taskTH.blockedOn = 'completado';
                        taskTH.setInstruction('Trabajo completado exitosamente.');
                    }
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `✅ ${result.reason}`);
                    const taskTM = kernel.getTaskById('tm');
                    if (taskTM && taskTM.state === 'RUNNING') {
                        taskTM.setInstruction('Ahora sí puedo ejecutar. TH ya terminó su trabajo crítico.');
                        taskTM.incrementExecution();
                    }
                }
            },

            // Paso 7: TM completa — TL ejecuta con prioridad restaurada
            {
                title: '📋 TM Completa — TL Retoma con su Prioridad Original (3)',
                description:
                    '<strong>TM</strong> finaliza. <strong>TL (prioridad 3 restaurada)</strong> ' +
                    'retoma la CPU para completar su trabajo restante.<br><br>' +
                    'Observá que TL ahora opera con su <strong>prioridad original 3</strong>, ' +
                    'no la heredada. El sistema de prioridades volvió a su orden natural.<br><br>' +
                    '🏁 La inversión de prioridad duró exactamente el tiempo de la sección crítica de TL. ' +
                    'El PIP la convirtió de <em>no acotada</em> a <em>acotada</em>.',
                action: () => {
                    kernel.tick();
                    const taskTM = kernel.getTaskById('tm');
                    if (taskTM && taskTM.state === 'RUNNING') {
                        taskTM.setState('BLOCKED', 'TM completó su trabajo');
                        taskTM.setInstruction('Trabajo completado.');
                    }
                    const result = scheduler.reschedule();
                    kernel.logEvent('scheduler', `📋 ${result.reason}`);
                    const taskTL = kernel.getTaskById('tl');
                    if (taskTL && taskTL.state === 'RUNNING') {
                        taskTL.setInstruction('Continuando trabajo con prioridad original 3. Sistema normalizado.');
                        taskTL.incrementExecution();
                    }
                }
            },

            // Paso 8: Resumen
            {
                title: '🏁 Resumen — ¿Qué Resolvió el PIP?',
                description:
                    '<strong>Sin PIP — Inversión NO acotada:</strong><br>' +
                    '1. TL toma mutex (p:3) → 2. TH llega (p:1), bloquea esperando mutex → ' +
                    '3. TM preempta a TL indefinidamente → 4. TH espera todo el tiempo de TM → ' +
                    '<em>Tiempo de espera de TH no acotado</em> ❌<br><br>' +
                    '<strong>Con PIP — Inversión acotada:</strong><br>' +
                    '1. TL toma mutex (p:3) → 2. TH llega (p:1), bloquea → ' +
                    '<strong>PIP eleva TL a p:1</strong> → 3. TM (p:2) no puede preemptar → ' +
                    '4. TL libera mutex rápidamente → 5. TH obtiene CPU → ' +
                    '<em>Inversión acotada al tiempo de sección crítica de TL</em> ✅<br><br>' +
                    '📚 <em>Silberschatz (2006, p.647): "VxWorks proporciona cerrojos mutex con ' +
                    'protocolo de herencia de prioridades para evitar la inversión de prioridad."</em>',
                action: () => {
                    kernel.tick();
                    kernel.logEvent('system', '🏁 Escenario PIP completado.');
                    kernel.logEvent('system',
                        '📊 Resultado: TH (alta prioridad) obtuvo el mutex sin ser bloqueada ' +
                        'indefinidamente por TM (media prioridad). PIP funcionó correctamente.'
                    );
                    kernel.logEvent('system',
                        '📚 Refs: González Harbour (2001) — POSIX de tiempo real; ' +
                        'Silberschatz (2006, p.647) — Fundamentos de SO; ' +
                        'FreeRTOS Reference Manual — Mutex and Priority Inheritance.'
                    );
                    this.completed = true;
                }
            }
        ];
    }

    /**
     * Crea las tareas de demostración
     */
    createTasks() {
        const tasks = [
            new Task('task_a', 'Tarea A - Control Motor', 0, 'Tarea crítica de control del motor. Máxima prioridad.'),
            new Task('task_b', 'Tarea B - Sensor', 1, 'Lectura de sensores. Alta prioridad. Se comunica por cola.'),
            new Task('task_c', 'Tarea C - Comunicación', 2, 'Procesamiento de datos de comunicación. Prioridad media.'),
            new Task('task_d', 'Tarea D - Interfaz', 3, 'Actualización de interfaz de usuario. Prioridad media-baja.'),
            new Task('task_e', 'Tarea E - Logger', 4, 'Registro de eventos del sistema. Mínima prioridad (tarea de fondo).')
        ];

        tasks.forEach(t => {
            t.createdAt = kernel.systemTick;
            t.lastStateChange = kernel.systemTick;
            kernel.tasks.push(t);
        });

        // Crear tarea IDLE
        const idleTask = new Task('idle', 'IDLE Task', 99, 'Tarea ociosa del sistema. Solo ejecuta cuando no hay trabajo.');
        idleTask.state = 'READY';
        kernel.tasks.push(idleTask);
        scheduler.setIdleTask(idleTask);
    }

    /**
     * Crea los recursos de sincronización (semáforos y colas)
     */
    createResources() {
        // Semáforos
        kernel.semaphores.push(new Semaphore('sem_i2c', 'I2C_Bus', 1, 1)); // Binario, disponible
        kernel.semaphores.push(new Semaphore('sem_uart', 'UART_Tx', 1, 1)); // Binario, disponible

        // Colas de mensajes
        kernel.messageQueues.push(new MessageQueue('q_sensor', 'SensorData', 3));
        kernel.messageQueues.push(new MessageQueue('q_ack', 'ACK_Channel', 2));
    }

    /**
     * Ejecuta el paso actual de la simulación
     * @returns {{ step: number, totalSteps: number, title: string, description: string, completed: boolean }|null}
     */
    executeNextStep() {
        if (this.currentStep + 1 >= this.steps.length) {
            this.completed = true;
            return null;
        }

        this.currentStep++;
        const step = this.steps[this.currentStep];

        // Ejecutar la acción del paso
        if (step.action) {
            step.action();
        }

        return {
            step: this.currentStep,
            totalSteps: this.steps.length,
            title: step.title,
            description: step.description,
            completed: this.currentStep >= this.steps.length - 1
        };
    }

    /**
     * Reinicia la simulación completamente
     */
    reset() {
        this.stopAutoPlay();
        this.currentStep = -1;
        this.started = false;
        this.completed = false;
        kernel.initialize();
        kernel.tasks = [];
        kernel.semaphores = [];
        kernel.mutexes = [];
        kernel.messageQueues = [];
        kernel.runningTask = null;
        kernel.systemTick = 0;
        kernel.eventLog = [];
        this.buildSteps(); // reconstruir según escenario activo
    }

    /**
     * Inicia el modo auto-play
     * @param {number} intervalMs - Milisegundos entre pasos
     * @param {function} callback - Función a llamar en cada paso
     */
    startAutoPlay(intervalMs, callback) {
        this.stopAutoPlay();
        this.autoPlayActive = true;
        this.autoPlayInterval = setInterval(() => {
            if (this.completed) {
                this.stopAutoPlay();
                return;
            }
            const result = this.executeNextStep();
            if (result && callback) {
                callback(result);
            }
            if (result && result.completed) {
                this.stopAutoPlay();
                if (callback) callback(result);
            }
        }, intervalMs);
    }

    /**
     * Detiene el auto-play
     */
    stopAutoPlay() {
        this.autoPlayActive = false;
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    /**
     * Retorna los datos para el informe descargable
     */
    getReportData() {
        return {
            steps: this.steps,
            totalSteps: this.steps.length,
            tasks: kernel.tasks.filter(t => t.id !== 'idle'),
            eventLog: kernel.eventLog,
            finalTick: kernel.systemTick
        };
    }
}

const simulation = new Simulation();