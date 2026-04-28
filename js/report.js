/**
 * report.js — Genera un informe descargable en formato texto
 * Contiene un resumen de la simulación, tareas y eventos.
 */

class ReportGenerator {
    /**
     * Genera el contenido del informe y lo descarga
     */
    static download() {
        const data = simulation.getReportData();
        const now = new Date().toLocaleString();

        let content = `===============================================================
 SIMULACIÓN DE RTOS - INFORME DE EJECUCIÓN
 Fecha: ${now}
 Basado en principios de FreeRTOS, QNX, Tanenbaum & Silberschatz
===============================================================

📊 RESUMEN GENERAL
  - Ticks totales del sistema: ${data.finalTick}
  - Total de pasos de simulación: ${data.totalSteps}
  - Tareas configuradas: ${data.tasks.length}

📋 TAREAS DEL SISTEMA (TCB)
${'-'.repeat(50)}
`;

        data.tasks.forEach(task => {
            content += `  ${task.name} (ID: ${task.id})
    Prioridad: ${task.priority}
    Descripción: ${task.description}
    Estado final: ${task.state}
    Ejecuciones: ${task.executionCount}
    Última instrucción: ${task.currentInstruction}
    ${task.blockedOn ? 'Bloqueado por: ' + task.blockedOn : ''}
${'-'.repeat(50)}
`;
        });

        content += `\n📜 SECUENCIA COMPLETA DE EVENTOS
${'-'.repeat(60)}
`;

        data.steps.forEach((step, index) => {
            content += `\nPASO ${index + 1}: ${step.title}\n`;
            // Limpiar HTML para el texto plano
            const desc = step.description.replace(/<[^>]+>/g, '');
            content += `  Descripción: ${desc}\n`;
        });

        content += `\n\n📝 LOG DE EVENTOS DEL KERNEL (Últimos 30)
${'-'.repeat(60)}
`;
        const logEntries = data.eventLog.slice(-30);
        logEntries.forEach(entry => {
            content += `[Tick ${entry.timestamp}] ${entry.message}\n`;
        });

        content += `\n\n📚 REFERENCIAS ACADÉMICAS
  - Tanenbaum, A. "Sistemas Operativos Modernos" (4ª ed.)
  - Silberschatz, A., Galvin, P., Gagne, G. "Operating System Concepts" (10ª ed.)
  - FreeRTOS Reference Manual (https://www.freertos.org)
  - QNX Neutrino RTOS Documentation (https://www.qnx.com)
  
  Conceptos demostrados:
  ✅ Scheduling preventivo por prioridad (0 = máxima)
  ✅ Preempción y cambio de contexto
  ✅ Semáforos binarios y bloqueo de tareas
  ✅ Colas de mensajes para comunicación inter-tarea
  ✅ Tarea IDLE del sistema
  ✅ Manejo de eventos y reactivación de tareas

===============================================================
`;

        // Crear blob y descargar
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `informe_rtos_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}