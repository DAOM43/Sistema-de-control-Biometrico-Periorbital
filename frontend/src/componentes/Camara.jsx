import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

const ANCHO_CAPTURA = 960

const Camara = forwardRef(function Camara({ onEstado }, ref) {
  const video = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let flujo
    let activo = true

    function falla(mensaje) {
      if (!activo) return
      setError(mensaje)
      onEstado?.('falla')
    }

    if (!navigator.mediaDevices) {
      falla('El navegador no permite acceder a la cámara.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (!activo) return stream.getTracks().forEach((t) => t.stop())
        flujo = stream
        video.current.srcObject = stream
        stream.getVideoTracks()[0].addEventListener('ended', () => falla('Se perdió la señal de la cámara.'))
        onEstado?.('lista')
      })
      .catch(() => falla('No se pudo acceder a la cámara. Verifique la conexión y los permisos del navegador.'))

    return () => {
      activo = false
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [onEstado])

  useImperativeHandle(ref, () => ({
    capturar() {
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth) return null
      const escala = Math.min(1, ANCHO_CAPTURA / v.videoWidth)
      const lienzo = document.createElement('canvas')
      lienzo.width = Math.round(v.videoWidth * escala)
      lienzo.height = Math.round(v.videoHeight * escala)
      lienzo.getContext('2d').drawImage(v, 0, 0, lienzo.width, lienzo.height)
      return lienzo.toDataURL('image/jpeg', 0.92)
    },
  }))

  return (
    <div className="camara">
      {error ? (
        <div className="camara-error" role="alert">{error}</div>
      ) : (
        <>
          <video ref={video} autoPlay playsInline muted />
          <div className="guia" aria-hidden="true" />
        </>
      )}
    </div>
  )
})

export default Camara