import { toast as sonnerToast } from 'sonner'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

/** Olumlu işlem - yeşil */
export function toastSuccess(title: string, description?: string) {
  sonnerToast.success(title, {
    description,
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
  })
}

/** Uyarı - turuncu */
export function toastWarning(title: string, description?: string) {
  sonnerToast.warning(title, {
    description,
    icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  })
}

/** Başarısız işlem - kırmızı */
export function toastError(title: string, description?: string) {
  sonnerToast.error(title, {
    description,
    icon: <XCircle className="h-5 w-5 text-red-600" />,
  })
}
