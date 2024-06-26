"use strict";
const Periodo = require("../models/periodo.model.js");
const Proceso = require("../models/proceso.model.js");
const Constants = require("../constants/periodos.constants.js");
const { handleError } = require("../utils/errorHandler");

async function getPeriodos() {
  try {
    const periodos = await Periodo.find();
    if (periodos.length === 0)
      return [null, "No hay periodos electivos registrados"];

    return [periodos, null];
  } catch (error) {
    handleError(error, "periodo.service -> getPeriodos");
  }
}

async function ValidarSecuencia(
  fechaInicioDate,
  numero_etapa,
  procesoId,
  proceso,
) {
  try {
    if (numero_etapa !== 1) {
      const periodoPrevio = await Periodo.findOne({
        numero_etapa: numero_etapa - 1,
        procesoId: procesoId,
      });

      if (!periodoPrevio) return [null, "La secuencia de etapas es incorrecta"];

      if (fechaInicioDate < periodoPrevio.fechaFin)
        return [
          null,
          `La fecha de inicio debe ser posterior a la fecha de finalización de la etapa anterior: '${periodoPrevio.fechaFin.toLocaleDateString()}'`,
        ];

      if (
        fechaInicioDate >
        new Date(periodoPrevio.fechaFin.getTime() + 14 * 24 * 60 * 60 * 1000)
      )
        return [
          null,
          `La fecha de inicio no puede exceder los 14 días después de la fecha de finalización de la etapa anterior: '${periodoPrevio.fechaFin.toLocaleDateString()}'`,
        ];
    } else {
      if (fechaInicioDate < proceso.fechaCreacion.toLocaleDateString())
        return [
          null,
          `La fecha de inicio debe ser posterior o igual a la fecha de creación del proceso: '${proceso.fechaCreacion.toLocaleDateString()}'`,
        ];

      if (
        fechaInicioDate >
        new Date(proceso.fechaCreacion.getTime() + 14 * 24 * 60 * 60 * 1000)
      )
        return [
          null,
          `La fecha de inicio no puede exceder los 14 días después de la fecha de creación del proceso: '${proceso.fechaCreacion.toLocaleDateString()}'`,
        ];
    }
    return [null, null];
  } catch (error) {
    handleError(error, "periodo.service -> ValidarSecuencia");
  }
}

async function createPeriodo(periodo) {
  try {
    const { nombre_etapa, fechaInicio, procesoId } = periodo;

    let fechaInicioDate = new Date(fechaInicio);

    const duracion = Constants.find(
      (periodo) => periodo.nombre_etapa === nombre_etapa,
    ).duracion;

    const numero_etapa = Constants.find(
      (periodo) => periodo.nombre_etapa === nombre_etapa,
    ).numero_etapa;

    // validar proceso
    const proceso = await Proceso.findById({ _id: procesoId });
    if (!proceso) return [null, "El proceso no existe"];
    if (proceso.finalizado === true)
      return [null, "No se pueden añadir etapas a un proceso finalizado"];

    // Verificar si el periodo ya existe dentro del proceso
    const periodoFound = await Periodo.findOne({
      nombre_etapa: nombre_etapa,
      procesoId: procesoId,
    });
    if (periodoFound)
      return [
        null,
        `El periodo: '${nombre_etapa}' ya existe dentro del proceso: '${proceso.nombre}'`,
      ];

    //Validar secuencia y fechas de las etapas.
    const [error, mensajeError] = await ValidarSecuencia(
      fechaInicioDate,
      numero_etapa,
      procesoId,
      proceso,
    );
    if (mensajeError || error) return [null, mensajeError];

    //crear el periodo
    const newPeriodo = new Periodo({
      nombre_etapa: nombre_etapa,
      fechaInicio: fechaInicioDate,
      procesoId: procesoId,
      fechaFin: new Date(
        fechaInicioDate.getTime() + duracion * 24 * 60 * 60 * 1000,
      ),
      duracion,
      numero_etapa,
    });
    await newPeriodo.save();

    // Actualizar el proceso
    let vueltas = 0;
    if (numero_etapa === 5) vueltas = 1;
    if (numero_etapa === 8) vueltas = 2;
    let finalizado = false;
    if (numero_etapa === 9) finalizado = true;

    const ProcesoUpdated = await Proceso.findByIdAndUpdate(
      procesoId,
      {
        $push: { periodos: newPeriodo._id },
        $set: { "proceso.vueltas": vueltas, "proceso.finalizado": finalizado },
      },
      { new: true },
    );
    if (!ProcesoUpdated)
      return [null, "No se pudo actualizar el proceso proceso correspondiente"];

    return [newPeriodo, null];
  } catch (error) {
    handleError(error, "periodo.service -> createPeriodo");
  }
}

async function updatePeriodo(id, periodo) {
  try {
    const { fechaInicio, numero_etapa, procesoId } = periodo;
    let fechaInicioDate = new Date(fechaInicio);

    const periodoFound = await Periodo.findById(id);
    if (!periodoFound) return [null, "El periodo no existe"];

    const proceso = await Proceso.findById({ _id: procesoId });
    if (!proceso) return [null, "El proceso no se pudo encontrar"];

    const duracion = Constants.find(
      (periodo) => periodo.nombre_etapa === periodoFound.nombre_etapa,
    ).duracion;

    //Validar la secuencia  y fechas de las etapas.
    const [error, mensajeError] = await ValidarSecuencia(
      fechaInicioDate,
      numero_etapa,
      procesoId,
      proceso,
    );
    if (mensajeError || error) return [null, mensajeError];

    const updatedPeriodo = await Periodo.findByIdAndUpdate(
      id,
      {
        fechaInicioDate,
        fechaFin: new Date(
          fechaInicioDate.getTime() + duracion * 24 * 60 * 60 * 1000,
        ),
      },
      { new: true },
    );

    return [updatedPeriodo, null];
  } catch (error) {
    handleError(error, "periodo.service -> updatePeriodo");
  }
}

async function deletePeriodo(id) {
  try {
    const periodoFound = await Periodo.findById(id);
    if (!periodoFound) return [null, "El periodo no existe"];

    const deletedPeriodo = await Periodo.findByIdAndDelete(id);
    if (!deletedPeriodo) return [null, "No se pudo eliminar el periodo"];

    const proceso = await Proceso.findByIdAndUpdate(
      { _id: deletedPeriodo.procesoId },
      { $pull: { periodos: deletedPeriodo._id } },
      { new: true },
    );
    if (!proceso) return [null, "No se pudo eliminar el periodo del proceso"];

    return [deletedPeriodo, null];
  } catch (error) {
    handleError(error, "periodo.service -> deletePeriodo");
  }
}

module.exports = { getPeriodos, createPeriodo, updatePeriodo, deletePeriodo };
