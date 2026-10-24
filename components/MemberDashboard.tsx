'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import dynamicImport from 'next/dynamic'
import ProfileModal from '@/components/ProfileModal'
import WalletModal from '@/components/WalletModal'
import PhysicalBorrowModal from '@/components/PhysicalBorrowModal'
import ThemeToggle from '@/components/ThemeToggle'
import BrandLogo from '@/components/BrandLogo'
import ActionModal from '@/components/ActionModal'
import { StudentDashboardSkeleton } from '@/components/skeletons'
import { useDebounce } from '@/utils/useDebounce'
import { DIGITAL_ACCESS_DURATION_OPTIONS, getDigitalAccessCost, normalizeAccessMode, type CanonicalAccessMode, type DigitalAccessCosts } from '@/utils/libraryContracts'

const BookAssistant = dynamicImport(() => import('@/components/BookAssistant'), { ssr: false })

type Book = {
  id: number
  title: string
  author: string
  category: string
  description: string | null
  isbn: string | null
  cover_image_url?: string | null
  access_points: number
  access_costs: DigitalAccessCosts | null
  access_mode: CanonicalAccessMode
  premium_price: number
  access_duration_days: number
  page_count?: number | null
  pdf_url?: string | null
  catalog_type: 'digital' | 'physical' | 'hybrid'
  is_archived: boolean
  isOwner?: boolean
  physical_registered_copies?: number
  physical_available_copies?: number
  physical_borrowed_copies?: number
  physical_locations?: string[] | null
}

type PhysicalBookSelection = {
  id: number
  title: string
  author: string
  category: string
  catalog_type: 'physical' | 'hybrid'
}

type PhysicalCatalogEntry = {
  id: number
  registered_copies: number
  available_copies: number
  borrowed_copies: number
  locations: string[] | null
}

type BorrowRequest = {
  id: number
  student_id: string
  book_id: number
  status: string
  request_date: string | null
  due_date: string | null
  returned_date: string | null
  notes: string | null
  duration_days?: number | null
  renewal_count?: number | null
  title?: string
  pdf_url?: string | null
}

type UserProfile = {
  full_name?: string
  email: string
  points_balance: number
  department?: string | null
}

type Fine = { id: number; amount: number; status: string; fine_type: 'late_fee' | 'lost_item' | 'damage' | 'other'; physical_book_request_id?: number | null; created_at: string | null; paid_at?: string | null; fine_reason?: string | null; waiver_reason?: string | null; receipt_number?: string | null }
type PrintPayment = { id: number; amount: number; description: string; receipt_number: string; created_at: string }
type EbookPayment = { id: number; book_id: number; fee_amount: number; transaction_reference: string; status: string; receipt_number: string | null; requested_at: string }
type SystemNotification = { id: number; title: string; message: string; read_at: string | null; created_at: string }
type FeedbackModal = { title: string; message: string; tone: 'success' | 'error' | 'info' }
type MemberReceipt = { title: string; receiptNumber: string; amount: number; date: string | null; description: string; payment: string }
type PhysicalLoan = {
  id: number
  book_id: number
  copy_id: number | null
  duration_days: number
  fee_amount: number
  payment_method: 'cash' | 'gcash'
  payment_status: 'unpaid' | 'pending_verification' | 'paid'
  status: 'pending' | 'checked_out' | 'return_pending' | 'returned' | 'rejected' | 'cancelled' | 'lost' | 'expired'
  requested_at: string
  checked_out_at: string | null
  due_date: string | null
  returned_at: string | null
  receipt_number: string | null
  transaction_reference?: string | null
  title?: string
}
type PhysicalAvailabilityAlert = { book_id: number; created_at: string; title?: string }

function getPhysicalCopyToken(qrData: string) {
  try {
    const token = new URL(qrData, window.location.origin).searchParams.get('copy')
    return token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
      ? token
      : null
  } catch {
    return null
  }
}
function LineIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
}

function DashboardIcon() { return <LineIcon><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></LineIcon> }
function BookIcon() { return <LineIcon><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></LineIcon> }
function BookMarkIcon() { return <LineIcon><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2H19v19l-5-3-5 3V4.5A2.5 2.5 0 0 0 6 4.5Z" /></LineIcon> }
function AccessIcon() { return <LineIcon><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></LineIcon> }
function RequestIcon() { return <LineIcon><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></LineIcon> }
function ProfileIcon() { return <LineIcon><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></LineIcon> }
function LogoutIcon() { return <LineIcon><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></LineIcon> }
function MenuIcon() { return <LineIcon><path d="M4 6h16M4 12h16M4 18h16" /></LineIcon> }
function BellIcon() { return <LineIcon className="h-4 w-4 shrink-0"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></LineIcon> }
function SearchIcon() { return <LineIcon><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.2 4.2" /></LineIcon> }
function FilterIcon() { return <LineIcon><path d="M4 6h16M7 12h10M10 18h4" /></LineIcon> }
function SortIcon() { return <LineIcon><path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" /></LineIcon> }
function CloseIcon() { return <LineIcon><path d="m6 6 12 12M18 6 6 18" /></LineIcon> }

export default function MemberDashboard({ memberType }: { memberType: 'student' | 'faculty' }) {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 200)
  const [catalogSort, setCatalogSort] = useState<'relevance' | 'title' | 'author' | 'newest'>('relevance')
  const [catalogControlsOpen, setCatalogControlsOpen] = useState(false)
  const [catalogDetailsBook, setCatalogDetailsBook] = useState<Book | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [physicalLoans, setPhysicalLoans] = useState<PhysicalLoan[]>([])
  const [availabilityAlerts, setAvailabilityAlerts] = useState<PhysicalAvailabilityAlert[]>([])
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  const [availabilityAlertSavingBookId, setAvailabilityAlertSavingBookId] = useState<number | null>(null)
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal | null>(null)
  const [requestingBookId, setRequestingBookId] = useState<number | null>(null)
  const [premiumReference, setPremiumReference] = useState('')
  const [premiumProofFile, setPremiumProofFile] = useState<File | null>(null)
  const [premiumSimulationConfirmed, setPremiumSimulationConfirmed] = useState(false)
  const [premiumPurchaseSaving, setPremiumPurchaseSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [physicalBook, setPhysicalBook] = useState<PhysicalBookSelection | null>(null)
  const [physicalCopyId, setPhysicalCopyId] = useState<number | null>(null)
  const [durationDays, setDurationDays] = useState('30')
  const [profileOpen, setProfileOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [finesOpen, setFinesOpen] = useState(false)
  const [clearanceFines, setClearanceFines] = useState<Fine[]>([])
  const [finesError, setFinesError] = useState<string | null>(null)
  const [printPayments, setPrintPayments] = useState<PrintPayment[]>([])
  const [ebookPayments, setEbookPayments] = useState<EbookPayment[]>([])
  const [clearanceError, setClearanceError] = useState<string | null>(null)
  const [physicalReceipt, setPhysicalReceipt] = useState<PhysicalLoan | null>(null)
  const [memberReceipt, setMemberReceipt] = useState<MemberReceipt | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scannerStatus, setScannerStatus] = useState('')
  const [scannerStarting, setScannerStarting] = useState(false)
  const [scannerStarted, setScannerStarted] = useState(false)
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null)
  const scannerStreamRef = useRef<MediaStream | null>(null)
  const scannerTimerRef = useRef<number | null>(null)
  const scannerActiveRef = useRef(false)
  const [continueReadingOpen, setContinueReadingOpen] = useState(false)
  const [activeAccessOpen, setActiveAccessOpen] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const initialDataLoaded = useRef(false)
  const [loanActionId, setLoanActionId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'renew'; id: number } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSidebarItem, setActiveSidebarItem] = useState('overview')
  const [fines, setFines] = useState<Fine[]>([])
  const [readingProgressLoaded, setReadingProgressLoaded] = useState(false)
  const [clock, setClock] = useState(0)
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([])
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [notificationReloadToken, setNotificationReloadToken] = useState(0)
  const [contributionOpen, setContributionOpen] = useState(false)
  const [contributionSubmitting, setContributionSubmitting] = useState(false)
  const [contributionStatus, setContributionStatus] = useState<string | null>(null)
  const [contributionMetadataStatus, setContributionMetadataStatus] = useState<string | null>(null)
  const [contributionForm, setContributionForm] = useState({ title: '', author: '', description: '', pdfUrl: '' })
  const [contributionFile, setContributionFile] = useState<File | null>(null)
  const contributionMetadataRequest = useRef(0)
  const [lastReadPages, setLastReadPages] = useState<Record<number, number>>({})
  const [readingProgress, setReadingProgress] = useState<Record<number, { current_page: number; total_pages: number | null }>>({})
  const [dataReloadToken, setDataReloadToken] = useState(0)

  const reportDashboardLoadError = (message: string) => {
    if (initialDataLoaded.current) {
      console.error(`[SmartLib] Dashboard refresh failed: ${message}`)
      return
    }
    setLoadError(message)
  }

  useEffect(() => {
    setClock(Date.now())
    const interval = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!notificationsOpen && !continueReadingOpen && !paymentsOpen && !finesOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        setContinueReadingOpen(false)
        setPaymentsOpen(false)
        setFinesOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [notificationsOpen, continueReadingOpen, paymentsOpen, finesOpen])

  useEffect(() => {
    if (!sidebarOpen) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!userId) return
    const channel = getSupabase()
      .channel('member-physical-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_copies' }, () => setDataReloadToken((token) => token + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_requests', filter: `student_id=eq.${userId}` }, () => setDataReloadToken((token) => token + 1))
      .subscribe()
    return () => { void getSupabase().removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    if (!scannerOpen) return
    setScannerError('')
    setScannerStatus('')
    return () => {
      scannerActiveRef.current = false
      setScannerStarting(false)
      setScannerStarted(false)
      if (scannerTimerRef.current !== null) window.clearTimeout(scannerTimerRef.current)
      scannerTimerRef.current = null
      scannerStreamRef.current?.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
      if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null
    }
  }, [scannerOpen])

  const startPhysicalQrScanner = async () => {
    setScannerError('')
    setScannerStatus('Requesting camera access…')
    setScannerStarting(true)
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStarting(false)
      setScannerStatus('')
      setScannerError(window.isSecureContext
        ? 'Camera access is unavailable in this browser. Choose a QR image instead.'
        : 'Camera access requires HTTPS or localhost. Open Mary the Queen College over a secure connection, or choose a QR image.')
      return
    }

    scannerActiveRef.current = true
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (cameraError) {
        if (!(cameraError instanceof DOMException) || !['OverconstrainedError', 'NotFoundError'].includes(cameraError.name)) throw cameraError
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }

      if (!scannerActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      scannerStreamRef.current = stream
      const video = scannerVideoRef.current
      if (!video) throw new Error('The camera preview could not be initialized.')
      video.srcObject = stream
      await video.play()
      setScannerStarting(false)
      setScannerStarted(true)
      setScannerStatus('Camera ready. Center the Mary the Queen College QR sticker in view.')

      const { default: jsQR } = await import('jsqr')
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('QR scanning is unavailable in this browser.')
      let scanCount = 0
      const scan = () => {
        if (!scannerActiveRef.current || !scannerVideoRef.current) return
        const currentVideo = scannerVideoRef.current
        if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.videoWidth > 0) {
          const scale = Math.min(1, 960 / currentVideo.videoWidth)
          canvas.width = Math.round(currentVideo.videoWidth * scale)
          canvas.height = Math.round(currentVideo.videoHeight * scale)
          context.drawImage(currentVideo, 0, 0, canvas.width, canvas.height)
          const frame = context.getImageData(0, 0, canvas.width, canvas.height)
          scanCount += 1
          const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: scanCount % 4 === 0 ? 'attemptBoth' : 'dontInvert' })
          if (result?.data) {
            const copyToken = getPhysicalCopyToken(result.data)
            if (copyToken) {
              window.location.href = `/dashboard/student?copy=${encodeURIComponent(copyToken)}#explore`
              return
            }
            setScannerError('This QR code is not a Mary the Queen College physical-book sticker. Try another code or image.')
            setScannerStatus('')
            scannerActiveRef.current = false
            return
          }
        }
        scannerTimerRef.current = window.setTimeout(scan, 180)
      }
      scan()
    } catch (cause) {
      scannerActiveRef.current = false
      setScannerStarting(false)
      setScannerStarted(false)
      scannerStreamRef.current?.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
      if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null
      setScannerStatus('')
      setScannerError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'The browser blocked camera access. Click the camera/site icon in the address bar and allow Camera access for this site, then select Start camera again.'
        : cause instanceof DOMException && cause.name === 'NotFoundError'
          ? 'No camera was found. Check that your webcam is connected and enabled, or choose a QR image.'
          : cause instanceof DOMException && cause.name === 'NotReadableError'
            ? 'The webcam is busy or unavailable. Close other apps using it, then select Start camera again.'
            : cause instanceof DOMException && cause.name === 'SecurityError'
              ? 'Camera access requires a secure HTTPS connection. Open Mary the Queen College over HTTPS or localhost, or choose a QR image.'
              : cause instanceof Error
                ? `Unable to start the camera: ${cause.message}`
                : 'Unable to start the camera. Check browser and operating-system camera permissions.')
    }
  }

  const scanQrImage = async (file: File) => {
    setScannerError('')
    setScannerStatus('Reading QR image…')
    try {
      const image = await createImageBitmap(file)
      try {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('QR scanning is unavailable in this browser.')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const { default: jsQR } = await import('jsqr')
        const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })
        const copyToken = result?.data ? getPhysicalCopyToken(result.data) : null
        if (!copyToken) {
          setScannerError('No Mary the Queen College book QR was found in that image. Try a clearer, well-lit photo.')
          setScannerStatus('')
          return
        }
        window.location.href = `/dashboard/student?copy=${encodeURIComponent(copyToken)}#explore`
      } finally {
        image.close()
      }
    } catch (cause) {
      setScannerError(cause instanceof Error ? `Unable to read that image: ${cause.message}` : 'Unable to read that QR image.')
      setScannerStatus('')
    }
  }

  useEffect(() => {
    if (!userId) return
    let active = true
    fetch('/api/notifications')
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load notifications.')
        if (!Array.isArray(result)) throw new Error('Notification response was invalid.')
        return result as SystemNotification[]
      })
      .then((data) => {
        if (active) {
          setSystemNotifications(data)
          setNotificationError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setNotificationError(error instanceof Error ? error.message : 'Unable to load notifications.')
      })
    return () => { active = false }
  }, [userId, notificationReloadToken])

  useEffect(() => {
    if (!userId) return
    let active = true
    const supabase = getSupabase()
    const loadMemberFines = async (recalculate = false) => {
      if (recalculate) {
        const { error: calculationError } = await supabase.rpc('calculate_overdue_fines')
        if (!active) return
        if (calculationError) {
          setFinesError(`Unable to update overdue fines: ${calculationError.message}`)
          return
        }
      }
      const { data, error } = await supabase.from('fines')
        .select('id,amount,status,fine_type,physical_book_request_id,created_at,paid_at,fine_reason,waiver_reason,receipt_number')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) {
        setFinesError(`Unable to load fines: ${error.message}`)
        return
      }
      const nextFines = (data ?? []) as Fine[]
      setClearanceFines(nextFines)
      setFines(nextFines.filter((fine) => fine.status === 'unpaid'))
      setFinesError(null)
    }
    void loadMemberFines(true)
    let midnightTimer: number | null = null
    const scheduleMidnightRecalculation = () => {
      const now = new Date()
      const timeParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(now)
      const part = (type: string) => Number(timeParts.find((item) => item.type === type)?.value ?? 0)
      const elapsedToday = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + now.getMilliseconds()
      const untilMidnight = 86_400_000 - elapsedToday + 1_000
      midnightTimer = window.setTimeout(async () => {
        await loadMemberFines(true)
        if (active) scheduleMidnightRecalculation()
      }, untilMidnight)
    }
    scheduleMidnightRecalculation()
    const channel = supabase.channel(`student-fines-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fines', filter: `student_id=eq.${userId}` }, () => void loadMemberFines())
      .subscribe()
    return () => {
      active = false
      if (midnightTimer !== null) window.clearTimeout(midnightTimer)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    if (!notificationsOpen) return
    const unreadNotifications = systemNotifications.slice(0, 5).filter((notification) => !notification.read_at)
    if (unreadNotifications.length === 0) return
    void Promise.all(unreadNotifications.map((notification) => markNotificationRead(notification.id)))
  }, [notificationsOpen, systemNotifications])

  useEffect(() => {
    if (!paymentsOpen || !userId) return
    let active = true
    const supabase = getSupabase()
    const loadPayments = async () => {
      const [printResult, ebookResult] = await Promise.all([
        supabase.from('library_print_payments').select('id,amount,description,receipt_number,created_at').eq('student_id', userId).order('created_at', { ascending: false }),
        supabase.from('ebook_purchase_requests').select('id,book_id,fee_amount,transaction_reference,status,receipt_number,requested_at').eq('student_id', userId).order('requested_at', { ascending: false }),
      ])
      if (!active) return
      const failed = printResult.error ?? ebookResult.error
      if (failed) setClearanceError(`Unable to load clearance records: ${failed.message}`)
      else setClearanceError(null)
      setPrintPayments((printResult.data ?? []) as PrintPayment[])
      setEbookPayments((ebookResult.data ?? []) as EbookPayment[])
    }
    void loadPayments()
    const channel = supabase.channel(`member-payments-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'library_print_payments', filter: `student_id=eq.${userId}` }, () => void loadPayments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ebook_purchase_requests', filter: `student_id=eq.${userId}` }, () => void loadPayments())
      .subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [paymentsOpen, userId])

  useEffect(() => {
    if (!userId || readingProgressLoaded) return
    getSupabase().from('reading_progress').select('book_id,current_page,total_pages').eq('user_id', userId).then(({ data }) => {
      setReadingProgress(Object.fromEntries((data ?? []).map((item: { book_id: number; current_page: number; total_pages: number | null }) => [item.book_id, item])))
      setReadingProgressLoaded(true)
    })
  }, [userId, readingProgressLoaded])

  useEffect(() => {
    const supabase = getSupabase()

    async function loadData() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      const currentUser = user
      if (!currentUser) {
        router.replace('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, email, full_name, points_balance, department')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (profileError) {
        reportDashboardLoadError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
        return
      }

      const role = profileData?.role ? String(profileData.role).trim().toLowerCase() : ''
      const email = profileData?.email ?? currentUser.email
      const fullName = profileData?.full_name ?? ''

      if (role !== memberType) {
        if (role === 'admin' || role === 'librarian') {
          router.replace('/dashboard/admin')
        } else if (role === 'faculty') {
          router.replace('/dashboard/faculty')
        } else if (role === 'student') {
          router.replace('/dashboard/student')
        } else {
          router.replace('/dashboard')
        }
        return
      }

      setProfile({ full_name: fullName, email: email ?? '', points_balance: profileData?.points_balance ?? 0, department: profileData?.department ?? null })
      setUserId(currentUser.id)

      const [booksResult, requestsResult, physicalLoansResult, contributionResult, physicalCatalogResult, availabilityAlertsResult] = await Promise.all([
        supabase
          .from('books')
          .select('id, title, author, category, description, isbn, cover_image_url, access_points, access_costs, access_mode, premium_price, access_duration_days, page_count, pdf_url, catalog_type, is_archived')
          .order('title', { ascending: true }),
        supabase
          .from('borrow_requests')
          .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days, renewal_count')
          .eq('student_id', currentUser.id)
          .order('request_date', { ascending: false }),
        supabase
          .from('physical_book_requests')
          .select('id, book_id, copy_id, duration_days, fee_amount, payment_method, payment_status, status, requested_at, checked_out_at, due_date, returned_at, receipt_number, transaction_reference')
          .eq('student_id', currentUser.id)
          .order('requested_at', { ascending: false }),
        supabase.from('book_contributions').select('approved_book_id').eq('user_id', currentUser.id).eq('status', 'approved'),
        supabase.rpc('get_public_physical_catalog'),
        supabase.from('physical_book_waitlist').select('book_id,created_at').eq('student_id', currentUser.id).order('created_at', { ascending: true }),
      ])

      const isMissingTableError = (result: { error?: { code?: string; message?: string } | null }) =>
        Boolean(result.error && (result.error.code === '42P01' || /relation .* does not exist/i.test(result.error.message ?? '')))
      const requiredError = [booksResult, requestsResult].find((result) => result.error)?.error
      if (requiredError) {
        reportDashboardLoadError(`Unable to load your library data. Apply the required Supabase schema, then try again. (${requiredError.message})`)
        return
      }
      if (contributionResult.error) {
        reportDashboardLoadError(`Unable to verify permanent contribution access. (${contributionResult.error.message})`)
        return
      }
      if (physicalLoansResult.error && !isMissingTableError(physicalLoansResult)) {
        reportDashboardLoadError(`Unable to load physical lending data. (${physicalLoansResult.error.message})`)
        return
      }
      if (availabilityAlertsResult.error && !isMissingTableError(availabilityAlertsResult)) {
        reportDashboardLoadError(`Unable to load physical availability alerts. (${availabilityAlertsResult.error.message})`)
        return
      }

      const ownedContributionBookIds = new Set((contributionResult.data ?? [])
        .map((item: { approved_book_id: number | null }) => item.approved_book_id)
        .filter((bookId): bookId is number => Number.isInteger(bookId)))
      const physicalCatalog = new Map<number, PhysicalCatalogEntry>((physicalCatalogResult.data ?? []).map((entry: PhysicalCatalogEntry) => [entry.id, entry]))
      const fetchedBooks: Book[] = (booksResult.data ?? []).map((book: any) => ({
        ...book,
        title: book.title ?? '',
        author: book.author ?? '',
        category: book.category ?? '',
        description: book.description ?? '',
        isbn: book.isbn ?? null,
        access_points: book.access_points ?? 0,
        access_costs: (book.access_costs ?? null) as DigitalAccessCosts | null,
        access_mode: ownedContributionBookIds.has(book.id)
          ? 'free'
          : normalizeAccessMode(book.access_mode, book.access_points),
        premium_price: Number(book.premium_price ?? 0),
        access_duration_days: book.access_duration_days ?? 30,
        page_count: book.page_count ?? null,
        pdf_url: book.pdf_url ?? null,
        catalog_type: book.catalog_type ?? 'digital',
        is_archived: book.is_archived ?? false,
        isOwner: ownedContributionBookIds.has(book.id),
        physical_registered_copies: physicalCatalog.get(book.id)?.registered_copies ?? 0,
        physical_available_copies: physicalCatalog.get(book.id)?.available_copies ?? 0,
        physical_borrowed_copies: physicalCatalog.get(book.id)?.borrowed_copies ?? 0,
        physical_locations: physicalCatalog.get(book.id)?.locations ?? null,
      }))

      const bookLookup = new Map<number, Book>(fetchedBooks.map((b) => [b.id, b]))
      setBooks(fetchedBooks)
      setAvailabilityAlerts((availabilityAlertsResult.data ?? []).map((entry: PhysicalAvailabilityAlert) => ({
        ...entry,
        title: bookLookup.get(entry.book_id)?.title,
      })))
      setBorrowRequests((requestsResult.data ?? []).map((request: BorrowRequest) => {
        const matchingBook = bookLookup.get(request.book_id)
        return {
          ...request,
          title: request.title ?? matchingBook?.title,
          pdf_url: matchingBook?.pdf_url ?? null,
        }
      }))
      setPhysicalLoans((physicalLoansResult.data ?? []).map((loan: PhysicalLoan) => ({
        ...loan,
        title: bookLookup.get(loan.book_id)?.title ?? `Book #${loan.book_id}`,
      })))
      initialDataLoaded.current = true
      setLoadError(null)
      setDataReady(true)
    }

    loadData()
  }, [router, dataReloadToken])

  useEffect(() => {
    const copyToken = new URLSearchParams(window.location.search).get('copy')
    if (!copyToken || !userId || !books.length) return
    let active = true
    void getSupabase().rpc('get_public_physical_copy', { p_qr_token: copyToken }).then(({ data, error }) => {
      if (!active || error) return
      const copy = Array.isArray(data) ? data[0] : data
      const book = books.find((item) => item.id === copy?.book_id)
      if (book) {
        setPhysicalCopyId(Number(copy.copy_id))
        setPhysicalBook({
          id: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
          catalog_type: book.catalog_type === 'physical' ? 'physical' : 'hybrid',
        })
      }
    })
    return () => { active = false }
  }, [books, userId])

  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'digital' | 'physical'>('all')

  const catalogBooks = useMemo(() => books.filter((book) => !book.is_archived), [books])

  const categories = useMemo(() => {
    const set = new Set<string>()
    catalogBooks.forEach((b) => {
      if (b.category && b.category.trim()) set.add(b.category.trim())
    })
    return ['All', ...Array.from(set)]
  }, [catalogBooks])

  const filteredBooks = useMemo(
    () => {
      const activeSearch = debouncedSearch.trim().toLowerCase()
      const searchTokens = activeSearch ? activeSearch.split(/\s+/) : []

      const results = catalogBooks
        .map((book) => ({
          ...book,
          status: 'Digital access',
        }))
        .filter((book) => {
          const matchesQuery =
            searchTokens.length === 0 ||
            searchTokens.every(
              (token) =>
                book.title.toLowerCase().includes(token) ||
                book.author.toLowerCase().includes(token) ||
                book.category.toLowerCase().includes(token) ||
                (book.isbn && book.isbn.toLowerCase().includes(token))
            )

          const matchesCategory =
            selectedCategory === 'All' ||
            book.category.toLowerCase() === selectedCategory.toLowerCase()

          const matchesFormat = selectedFormat === 'all' ||
            (selectedFormat === 'physical' ? book.catalog_type !== 'digital' : book.catalog_type !== 'physical')

          return matchesQuery && matchesCategory && matchesFormat
        })

      return results.sort((a, b) => {
        if (catalogSort === 'title') return a.title.localeCompare(b.title)
        if (catalogSort === 'author') return a.author.localeCompare(b.author)
        if (catalogSort === 'newest') return b.id - a.id
        return 0
      })
    },
    [catalogBooks, debouncedSearch, selectedCategory, selectedFormat, catalogSort]
  )

  const activeLoans = useMemo(
    () => borrowRequests.filter((request) =>
      request.status === 'approved' &&
      !request.returned_date &&
      Boolean(request.due_date && new Date(request.due_date).getTime() > clock)
    ),
    [borrowRequests, clock]
  )
  const ownedContributionBooks = useMemo(
    () => books.filter((book) => book.isOwner && book.pdf_url),
    [books]
  )
  const activePhysicalLoanCount = physicalLoans.filter((loan) => loan.status === 'checked_out' || loan.status === 'return_pending').length
  const pendingPhysicalLoanCount = physicalLoans.filter((loan) => loan.status === 'pending').length
  const unpaidFineCount = clearanceFines.filter((fine) => fine.status === 'unpaid').length

  const activeBorrowRequests = useMemo(() => {
    const activeLoanIds = new Set(activeLoans.map((loan) => loan.id))
    return borrowRequests.filter((request) => request.status === 'pending' || activeLoanIds.has(request.id))
  }, [borrowRequests, activeLoans])

  useEffect(() => {
    const saved: Record<number, number> = {}
    activeLoans.forEach((loan) => {
      const page = Number(window.localStorage.getItem(`smart-lib:last-page:${loan.book_id}`))
      if (Number.isInteger(page) && page > 0) saved[loan.book_id] = page
    })
    setLastReadPages(saved)
  }, [activeLoans])

  const continueReading = useMemo(
    () => [
      ...activeLoans.filter((loan) => loan.pdf_url).map((loan) => ({ ...loan, isOwner: false })),
      ...ownedContributionBooks.map((book) => ({
        id: `contribution-${book.id}`,
        book_id: book.id,
        title: book.title,
        isOwner: true,
      })),
    ],
    [activeLoans, ownedContributionBooks]
  )

  const readingHistory = useMemo(
    () =>
      borrowRequests
        .filter((request) =>
          request.status === 'returned' ||
          request.status === 'revoked' ||
          request.status === 'rejected' ||
          (request.status === 'approved' && !request.returned_date && Boolean(request.due_date && new Date(request.due_date).getTime() <= clock))
        )
        .map((request) => ({
          id: request.id,
          title: request.title ?? `Book #${request.book_id}`,
          action: request.status === 'returned' ? 'Returned' : request.status === 'revoked' ? 'Revoked' : request.status === 'rejected' ? 'Rejected' : 'Expired',
          date: request.status === 'approved' && request.due_date
            ? new Date(request.due_date).toLocaleDateString()
            : request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A',
        })),
    [borrowRequests, clock]
  )

  const alertCount = systemNotifications.filter((notification) => !notification.read_at).length + activeLoans.filter((loan) => {
    if (!loan.due_date) return false
    const dueDate = new Date(loan.due_date)
    const diffDays = Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  }).length

  const urgentLoans = useMemo(() => {
    return activeLoans
      .map((loan) => {
        if (!loan.due_date) return null
        const dueDate = new Date(loan.due_date)
        const diffDays = Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24))
        return {
          ...loan,
          diffDays,
          isDueSoon: diffDays >= 0 && diffDays <= 2,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item && item.isDueSoon))
  }, [activeLoans, clock])

  // Realtime updates for loans & profile points
  useEffect(() => {
    if (!userId) return

    const supabase = getSupabase()
    const channel = supabase
      .channel(`student-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'borrow_requests',
          filter: `student_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as BorrowRequest
            setBorrowRequests((prev) => {
              if (prev.some((r) => r.id === newReq.id)) return prev
              const matchingBook = books.find((b) => b.id === newReq.book_id)
              return [
                {
                  ...newReq,
                  title: newReq.title ?? matchingBook?.title,
                  pdf_url: matchingBook?.pdf_url ?? null,
                },
                ...prev,
              ]
            })
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as BorrowRequest
            setBorrowRequests((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, ...updated, title: r.title, pdf_url: r.pdf_url } : r))
            )
            if (updated.status === 'approved') {
              setRequestStatus('Digital access approved! Your new book is now ready in My Library.')
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: number }
            setBorrowRequests((prev) => prev.filter((r) => r.id !== deleted.id))
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const updatedProfile = payload.new as { points_balance?: number; full_name?: string }
          if (updatedProfile) {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    points_balance: updatedProfile.points_balance ?? prev.points_balance,
                    full_name: updatedProfile.full_name ?? prev.full_name,
                  }
                : prev
            )
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, books])

  const handleLogout = async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const togglePhysicalAvailabilityAlert = async (book: Book) => {
    if (!userId) {
      setRequestStatus('Sign in to manage physical-book availability alerts.')
      return
    }

    const subscribed = availabilityAlerts.some((alert) => alert.book_id === book.id)
    setAvailabilityAlertSavingBookId(book.id)
    setRequestStatus(null)
    try {
      const { error: alertError } = await getSupabase().rpc(
        subscribed ? 'leave_physical_book_waitlist' : 'join_physical_book_waitlist',
        { p_book_id: book.id }
      )

      if (alertError) {
        const message = alertError.message.replace('availability queue', 'availability alerts')
        setRequestStatus(`Unable to ${subscribed ? 'turn off' : 'turn on'} the availability alert. (${message})`)
      } else if (subscribed) {
        setAvailabilityAlerts((current) => current.filter((alert) => alert.book_id !== book.id))
        setRequestStatus(`Availability alert turned off for "${book.title}".`)
      } else {
        setAvailabilityAlerts((current) => [...current, {
          book_id: book.id,
          created_at: new Date().toISOString(),
          title: book.title,
        }])
        setRequestStatus(`You'll be notified when "${book.title}" is available. Alerts do not reserve a copy; borrowing is first come, first served.`)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unexpected error'
      setRequestStatus(`Unable to ${subscribed ? 'turn off' : 'turn on'} the availability alert. (${message})`)
    } finally {
      setAvailabilityAlertSavingBookId(null)
    }
  }

  const markNotificationRead = async (notificationId: number) => {
    setNotificationError(null)
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update notification.')
      setSystemNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, read_at: result.read_at ?? new Date().toISOString() }
        : item))
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to update notification.')
    }
  }

  const submitAccessRequest = async () => {
    if (!selectedBook) return
    const book = selectedBook
    if (!userId) return
    if (book.isOwner) {
      router.push(`/reader/${book.id}`)
      setSelectedBook(null)
      return
    }
    setRequestingBookId(book.id)
    setRequestStatus(null)

    try {
      const response = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: book.id, durationDays: Number(durationDays) }),
      })
      const data = await response.json()

      if (!response.ok) {
        setFeedbackModal({ title: 'Request not completed', message: data.error || 'Something went wrong while requesting digital access.', tone: 'error' })
        return
      }

      const isApproved = data.status === 'approved'
      setFeedbackModal({
        title: isApproved ? 'Access granted' : 'Request submitted',
        message: isApproved
          ? `Access to ${book.title} is ready for ${durationDays} days. You can start reading now.`
          : `Your request for ${book.title} (${durationDays} days) was submitted successfully. You’ll see an update when it is reviewed.`,
        tone: 'success',
      })
      const pointsCost = book.access_mode === 'points' ? Number(data.pointsCost ?? getDigitalAccessCost(book.access_costs, Number(durationDays), book.access_points)) : 0
      const supabase = getSupabase()
      const { data: refreshedProfile } = await supabase.from('profiles').select('points_balance').eq('id', userId).maybeSingle()
      setProfile((current) => current ? { ...current, points_balance: Number(refreshedProfile?.points_balance ?? current.points_balance - pointsCost) } : current)
      const { data: requestsResult } = await supabase
        .from('borrow_requests')
        .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days, renewal_count')
        .eq('student_id', userId)
        .order('request_date', { ascending: false })
      setBorrowRequests((requestsResult ?? []).map((request: BorrowRequest) => ({
        ...request,
        title: request.title ?? books.find((book) => book.id === request.book_id)?.title,
      })))
    } catch (error) {
      setFeedbackModal({
        title: 'Request not completed',
        message: error instanceof Error ? error.message : 'Unable to request digital access. Please try again.',
        tone: 'error',
      })
    } finally {
      setRequestingBookId(null)
      setSelectedBook(null)
    }
  }

  const submitPremiumPurchase = async () => {
    if (!selectedBook || selectedBook.access_mode !== 'premium' || !userId) return
    if (!premiumSimulationConfirmed) {
      setRequestStatus('Confirm that you are submitting a simulated GCash payment for this capstone demo.')
      return
    }
    if (!premiumReference.trim() || !premiumProofFile) {
      setRequestStatus('Enter the payment reference and upload the payment proof.')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(premiumProofFile.type) || premiumProofFile.size > 5 * 1024 * 1024) {
      setRequestStatus('Payment proof must be JPG, PNG, or WebP and no larger than 5 MB.')
      return
    }
    setPremiumPurchaseSaving(true)
    setRequestStatus(null)
    let proofPath: string | null = null
    const supabase = getSupabase()
    try {
      const extension = premiumProofFile.type === 'image/jpeg' ? 'jpg' : premiumProofFile.type.split('/')[1]
      proofPath = `${userId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('ebook-payment-proofs').upload(proofPath, premiumProofFile, { contentType: premiumProofFile.type, upsert: false })
      if (uploadError) throw new Error(`Payment proof upload failed: ${uploadError.message}`)
      const { error: purchaseError } = await supabase.rpc('request_premium_ebook_purchase', {
        p_book_id: selectedBook.id,
        p_transaction_reference: premiumReference.trim(),
        p_payment_proof_path: proofPath,
      })
      if (purchaseError) throw new Error(purchaseError.message)
      setFeedbackModal({
        title: 'Payment submitted',
        message: `Your payment evidence for ${selectedBook.title} was submitted successfully. Staff will verify it before permanent access is granted.`,
        tone: 'success',
      })
      setPremiumReference('')
      setPremiumProofFile(null)
      setPremiumSimulationConfirmed(false)
      setSelectedBook(null)
    } catch (cause) {
      if (proofPath) await supabase.storage.from('ebook-payment-proofs').remove([proofPath])
      setFeedbackModal({
        title: 'Payment not submitted',
        message: cause instanceof Error ? cause.message : 'Unable to submit the premium e-book payment.',
        tone: 'error',
      })
    } finally {
      setPremiumPurchaseSaving(false)
    }
  }

  const executeRenewLoan = async (loanId: number) => {
    const loan = borrowRequests.find((request) => request.id === loanId)
    if (!loan || loan.status !== 'approved' || loan.returned_date) {
      setFeedbackModal({ title: 'Renewal unavailable', message: 'This e-book is no longer available for renewal.', tone: 'error' })
      return
    }
    setLoanActionId(loanId)
    setRequestStatus(null)
    try {
      const { data, error } = await getSupabase().rpc('renew_digital_loan', { request_id: loanId, extension_days: 14 })
      if (error) throw new Error(error.message)
      setBorrowRequests((current) => current.map((request) => request.id === loanId ? { ...request, ...data } : request))
      setFeedbackModal({ title: 'Access renewed', message: `Access to ${loan.title ?? 'this e-book'} was renewed for 14 more days.`, tone: 'success' })
    } catch (error) {
      setFeedbackModal({
        title: 'Renewal not completed',
        message: error instanceof Error ? error.message : 'Unable to renew this e-book.',
        tone: 'error',
      })
    } finally {
      setLoanActionId(null)
    }
  }

  const handleLoanAction = (loanId: number) => setConfirmAction({ type: 'renew', id: loanId })
  async function handleContributionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || !contributionFile) {
      setContributionStatus('Please choose a PDF file before submitting.')
      return
    }
    if (contributionFile.type !== 'application/pdf' || contributionFile.size > 50 * 1024 * 1024) {
      setContributionStatus('Only PDF files up to 50 MB are accepted.')
      return
    }
    setContributionSubmitting(true)
    setContributionStatus(null)
    try {
      const uploadData = new FormData()
      uploadData.append('file', contributionFile)
      uploadData.append('category', 'Contributions')
      uploadData.append('provider', 'supabase')
      uploadData.append('allow_fallback', 'false')
      const uploadResponse = await fetch('/api/storage/upload', { method: 'POST', body: uploadData })
      const uploaded = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(uploaded.error || 'Unable to upload PDF.')

      const { error } = await getSupabase().rpc('submit_book_contribution_v2', {
        p_title: contributionForm.title.trim(),
        p_author: contributionForm.author.trim(),
        p_description: contributionForm.description.trim() || null,
        p_pdf_url: uploaded.pdf_url || uploaded.storage_path,
        p_storage_provider: uploaded.storage_provider || 'supabase',
        p_storage_file_id: uploaded.storage_file_id || null,
        p_storage_path: uploaded.storage_path || null,
        p_file_name: uploaded.file_name || contributionFile.name,
        p_file_size: uploaded.file_size ?? contributionFile.size,
        p_mime_type: uploaded.mime_type || 'application/pdf',
      })
      if (error) throw new Error(error.message)
      setContributionForm({ title: '', author: '', description: '', pdfUrl: '' })
      setContributionFile(null)
      setContributionOpen(false)
      setContributionStatus('Contribution submitted successfully and is awaiting review.')
      setFeedbackModal({
        title: 'Contribution submitted',
        message: 'Your contribution was received and is awaiting administrator review. It will appear in the library only if it is approved.',
        tone: 'success',
      })
      setDataReloadToken((value) => value + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit contribution.'
      setContributionStatus(message)
      setFeedbackModal({
        title: 'Contribution not submitted',
        message,
        tone: 'error',
      })
    } finally {
      setContributionSubmitting(false)
    }
  }

  async function handleContributionFileSelected(file: File | null) {
    const requestId = ++contributionMetadataRequest.current
    setContributionFile(file)
    setContributionMetadataStatus(null)
    if (!file) return

    const formAtSelection = contributionForm
    const fallbackTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (file.type !== 'application/pdf' || file.size > 50 * 1024 * 1024) {
      setContributionMetadataStatus('Choose a PDF file up to 50 MB to autofill its details.')
      return
    }

    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const document = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        useSystemFonts: true,
        isEvalSupported: false,
      }).promise
      try {
        const metadata = await document.getMetadata()
        if (requestId !== contributionMetadataRequest.current) return
        const info = metadata.info as { Title?: unknown; Author?: unknown; Subject?: unknown }
        const title = typeof info.Title === 'string' ? info.Title.trim() : ''
        const author = typeof info.Author === 'string' ? info.Author.trim() : ''
        const description = typeof info.Subject === 'string' ? info.Subject.trim() : ''
        const values = { title: title || fallbackTitle, author, description }
        setContributionForm((current) => ({
          ...current,
          title: !formAtSelection.title && current.title === formAtSelection.title && values.title ? values.title : current.title,
          author: !formAtSelection.author && current.author === formAtSelection.author && values.author ? values.author : current.author,
          description: !formAtSelection.description && current.description === formAtSelection.description && values.description ? values.description : current.description,
        }))
        const filledFields = [
          values.title && !formAtSelection.title ? 'title' : '',
          values.author && !formAtSelection.author ? 'author' : '',
          values.description && !formAtSelection.description ? 'description' : '',
        ].filter(Boolean)
        setContributionMetadataStatus(filledFields.length
          ? `Filled ${filledFields.join(', ')} from the PDF. Please review before submitting.`
          : 'PDF selected. Its details were not used because you already entered them.')
      } finally {
        await document.destroy()
      }
    } catch {
      if (requestId !== contributionMetadataRequest.current) return
      if (!formAtSelection.title) {
        setContributionForm((current) => current.title === formAtSelection.title && fallbackTitle
          ? { ...current, title: fallbackTitle }
          : current)
      }
      setContributionMetadataStatus('Could not read the PDF metadata. The filename can be used as the title; please enter the other details manually.')
    }
  }

  if (loadError) {
    return (
      <main className="surface-page flex min-h-screen items-center justify-center px-6 py-12">
        <section className="surface-card w-full max-w-lg p-8">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Profile setup required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pine-action mt-6 rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Try again
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="dashboard-shell student-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="student-sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`dashboard-layout student-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'dashboard-sidebar-collapsed sidebar-collapsed' : ''}`}>
        <aside id="member-navigation" className={`dashboard-sidebar student-sidebar ${sidebarOpen ? 'dashboard-sidebar-open sidebar-open' : ''}`}>
          <div className="student-sidebar-header">
            <BrandLogo className="student-brand" iconSize="sm" />
            <button type="button" className="student-sidebar-toggle" onClick={() => { if (sidebarOpen) setSidebarOpen(false); else setSidebarCollapsed((current) => !current) }} aria-label={sidebarOpen ? 'Close navigation' : sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarOpen ? 'Close navigation' : sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}><span className="sr-only">{sidebarOpen ? 'Close navigation' : sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}</span>{sidebarOpen ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
          <p className="student-sidebar-label">Workspace</p>
          <nav className="student-nav" aria-label={`${memberType === 'faculty' ? 'Faculty' : 'Student'} workspace`}>
            <a className={activeSidebarItem === 'overview' ? 'active' : ''} href="#overview" aria-label="Overview" title={sidebarCollapsed ? 'Overview' : undefined} onClick={() => { setActiveSidebarItem('overview'); setSidebarOpen(false) }}><DashboardIcon /><span>Overview</span></a>
            <a className={activeSidebarItem === 'catalog' ? 'active' : ''} href="#explore" aria-label="Catalog" title={sidebarCollapsed ? 'Catalog' : undefined} onClick={() => { setActiveSidebarItem('catalog'); setSidebarOpen(false) }}><BookIcon /><span>Catalog</span></a>
            <button type="button" className={activeSidebarItem === 'library' ? 'active' : ''} aria-label="My library" title={sidebarCollapsed ? 'My library' : undefined} onClick={() => { setActiveSidebarItem('library'); setActiveAccessOpen(true); setSidebarOpen(false) }}><BookMarkIcon /><span>My library</span></button>
            <button type="button" className={activeSidebarItem === 'payments' ? 'active' : ''} aria-label="Requests and payments" title={sidebarCollapsed ? 'Requests and payments' : undefined} onClick={() => { setActiveSidebarItem('payments'); setPaymentsOpen(true); setSidebarOpen(false) }}><RequestIcon /><span>Requests &amp; Payments</span></button>
            {memberType === 'faculty' ? <button type="button" className={activeSidebarItem === 'materials' ? 'active' : ''} aria-label="Course materials" title={sidebarCollapsed ? 'Course materials' : undefined} onClick={() => { setActiveSidebarItem('materials'); setContributionOpen(true); setSidebarOpen(false) }}><RequestIcon /><span>Course materials</span></button> : null}
            <button type="button" onClick={() => { setScannerError(''); setScannerOpen(true); setSidebarOpen(false) }}><span aria-hidden="true">▣</span><span>Scan book QR</span></button>
          </nav>
          <div className="student-sidebar-footer">
            <div className="student-theme-control"><ThemeToggle /></div>
            <button type="button" onClick={() => setProfileOpen(true)}><ProfileIcon /><span>Profile</span></button>
            <button type="button" onClick={handleLogout}><LogoutIcon /><span>Sign out</span></button>
          </div>
        </aside>
        <main id="overview" className="dashboard-workspace student-workspace space-y-8">
        {!dataReady ? (
          <StudentDashboardSkeleton />
        ) : (
          <>
          <header className="dashboard-hero student-hero rounded-[2rem] p-6 lg:p-8">
          <button type="button" className="student-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-controls="member-navigation" aria-expanded={sidebarOpen} aria-label="Open navigation"><MenuIcon /></button>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-celadon">{memberType === 'faculty' ? 'Faculty Dashboard' : 'Student Dashboard'}</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">Hello, {profile?.full_name?.trim() || (memberType === 'faculty' ? 'faculty member' : 'student')}</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{memberType === 'faculty' ? 'Browse, borrow, and read learning materials with the same library access and points features available to students.' : 'Browse the library, track active access, and manage your requests in one place.'}</p>
              {memberType === 'faculty' && profile?.department ? <p className="mt-2 text-xs font-semibold text-pine-700 dark:text-pine-200">Faculty · {profile.department}</p> : null}
            </div>
            <div className="student-hero-actions">
              <button type="button" onClick={() => setRequestsOpen(true)} className="student-notification-button" aria-label="Open borrow requests" title="Borrow requests"><RequestIcon />{borrowRequests.filter((request) => request.status === 'pending').length > 0 ? <span className="student-notification-badge" aria-hidden="true">{borrowRequests.filter((request) => request.status === 'pending').length}</span> : null}</button>
              <button type="button" onClick={() => setNotificationsOpen(true)} className="student-notification-button" aria-label={alertCount > 0 ? `${alertCount} active alerts` : 'Notifications'} title="Notifications"><BellIcon />{alertCount > 0 ? <span className="student-notification-badge" aria-hidden="true">{alertCount}</span> : null}</button>
            </div>
          </div>
        </header>

        {urgentLoans.length > 0 ? (
          <div className="rounded-[1.75rem] border border-amber-300 bg-amber-50/90 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="text-xl" aria-hidden="true">⚠️</span>
                <div>
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                    Access Expiring Soon
                  </h3>
                  <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/90">
                    {urgentLoans.map((loan) =>
                      `"${loan.title}" expires ${loan.diffDays === 0 ? 'today' : `in ${loan.diffDays} day(s)`}.`
                    ).join(' ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {urgentLoans.map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => void handleLoanAction(loan.id)}
                    disabled={loanActionId === loan.id}
                    className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950"
                  >
                    {loanActionId === loan.id ? 'Renewing...' : `Renew "${loan.title?.slice(0, 16)}..." (+14d)`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <BookAssistant />

        {/* Student Personal Study Analytics Strip */}
        <div className="student-analytics-strip grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="student-stat-card student-points-card rounded-2xl border border-pine-200 bg-pine-50 p-5 shadow-sm dark:border-forest-700 dark:bg-forest-800/70">
            <span className="text-xs font-semibold uppercase tracking-wider text-pine-700 dark:text-pine-200">Points balance</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{profile?.points_balance ?? 0}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">points</span>
            </div>
            <div className="student-stat-actions mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setWalletOpen(true)} className="rounded-xl bg-forest-900 px-3 py-2 text-xs font-semibold text-paper-100 hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900">Wallet</button>
            </div>
          </div>

          <div className="student-stat-card physical-lending-card rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <div className="physical-lending-heading">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Physical lending</span>
            </div>
            <div className="physical-lending-metrics">
              <div><span className="physical-lending-count">{activePhysicalLoanCount}</span><span>active loans</span></div>
              <div><span className="physical-lending-count">{unpaidFineCount}</span><span>unpaid fines</span></div>
            </div>
            <div className="physical-lending-status" aria-live="polite">
              {unpaidFineCount > 0
                ? <p className="physical-lending-pending">{unpaidFineCount} outstanding charge{unpaidFineCount === 1 ? '' : 's'} to resolve with library staff</p>
                : pendingPhysicalLoanCount > 0
                  ? <p className="physical-lending-pending">{pendingPhysicalLoanCount} request{pendingPhysicalLoanCount === 1 ? '' : 's'} awaiting librarian confirmation</p>
                  : <p>{physicalLoans.length} total physical request{physicalLoans.length === 1 ? '' : 's'}</p>}
            </div>
            <div className="physical-lending-actions">
              <button type="button" onClick={() => setFinesOpen(true)} className="secondary-action">Fines &amp; clearance</button>
            </div>
          </div>

          <div className="student-stat-card student-reading-summary rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reading</span>
            <div className="student-reading-metrics mt-3">
              <div><strong>{continueReading.length}</strong><span>available now</span></div>
              <div><strong>{borrowRequests.filter((request) => request.status === 'returned').length}</strong><span>completed</span></div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{continueReading.length > 0 ? `${Object.keys(readingProgress).filter((bookId) => continueReading.some((loan) => loan.book_id === Number(bookId))).length} books with saved progress` : 'No active e-books to resume'}</p>
            <div className="student-reading-actions mt-auto grid grid-cols-2 gap-2 pt-3">
              <button type="button" onClick={() => setHistoryOpen(true)} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold">History</button>
              <button type="button" onClick={() => {
                if (continueReading.length > 0) setContinueReadingOpen(true)
                else document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })
              }} className="student-reading-now-action !mt-0">
                {continueReading.length > 0 ? 'Continue' : 'Browse'}
              </button>
            </div>
          </div>

        </div>

        <section className="student-content-grid grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div id="explore" className="catalog-panel rounded-[2rem] p-6 lg:p-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog & discovery</h2>
              <div className="catalog-tools">
                <form id="catalog-controls" className="catalog-toolbar" onSubmit={(event) => event.preventDefault()}>
                  <label className="catalog-search-box">
                    <SearchIcon />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Search title, author or category"
                      aria-label="Search title, author or category"
                    />
                    {searchInput ? <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search">×</button> : null}
                  </label>
                  <label className="catalog-sort-box">
                    <span className="sr-only">Sort by</span>
                    <SortIcon />
                    <select
                      value={catalogSort}
                      onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}
                      aria-label="Sort by"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="title">Title A-Z</option>
                      <option value="author">Author A-Z</option>
                      <option value="newest">Recently added</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`catalog-filter-toggle${selectedCategory !== 'All' || selectedFormat !== 'all' ? ' has-active-filters' : ''}`}
                    onClick={() => setCatalogControlsOpen((current) => !current)}
                    aria-expanded={catalogControlsOpen}
                    aria-controls="catalog-filter-menu"
                  >
                    <FilterIcon />
                    <span>Filters</span>
                    {selectedCategory !== 'All' || selectedFormat !== 'all' ? <span className="catalog-filter-count">{Number(selectedCategory !== 'All') + Number(selectedFormat !== 'all')}</span> : null}
                  </button>
                </form>
                {catalogControlsOpen ? (
                  <div id="catalog-filter-menu" className="catalog-filter-menu">
                    <label>
                      <span>Category</span>
                      <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Format</span>
                      <select value={selectedFormat} onChange={(event) => setSelectedFormat(event.target.value as typeof selectedFormat)}>
                        <option value="all">All materials</option>
                        <option value="digital">Digital</option>
                        <option value="physical">Physical</option>
                      </select>
                    </label>
                    {selectedCategory !== 'All' || selectedFormat !== 'all' ? (
                      <button type="button" className="catalog-clear-filters" onClick={() => { setSelectedCategory('All'); setSelectedFormat('all') }}>Clear filters</button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-900 dark:text-slate-100">{filteredBooks.length}</span> of {catalogBooks.length} volumes
                </div>
              </div>

              <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book) => (
                    <article
                      key={book.id}
                      className="resource-card rounded-[1.5rem] p-5"
                      role="button"
                      tabIndex={0}
                      aria-label={`View details and actions for ${book.title}`}
                      aria-haspopup="dialog"
                      onClick={() => setCatalogDetailsBook(book)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setCatalogDetailsBook(book)
                        }
                      }}
                    >
                      <div className="resource-card-layout">
                        <div className="resource-cover">
                          <div className="resource-cover-placeholder" aria-hidden="true"><span className="resource-cover-mark"><img src="/mary-the-queen-college-crest.jpg" alt="" loading="lazy" /></span><span>{book.category}</span></div>
                          {book.cover_image_url ? <img className="resource-cover-image" src={book.cover_image_url} alt={`${book.title} cover`} loading="lazy" onError={(event) => { event.currentTarget.remove() }} /> : null}
                        </div>
                        <div className="resource-card-heading">
                          <div className="flex flex-wrap items-center gap-2"><p className="text-celadon text-sm font-semibold uppercase tracking-[0.2em]">{book.category}</p><span className="rounded-full border border-paper-300 bg-paper-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-forest-700 dark:bg-forest-800 dark:text-slate-300">{book.catalog_type === 'physical' ? 'Physical' : book.catalog_type === 'hybrid' ? 'Digital + physical' : 'Digital'}</span></div>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">by {book.author}</p>
                        </div>
                      </div>
                    </article>
                  ))
                ) : dataReady ? (
                  <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No matching resources. Try a broader title, author, or subject.
                  </div>
                ) : null}
              </div>

              {requestStatus ? (
                <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                  {requestStatus}
                </div>
              ) : null}
            </div>

            <div id="access" className="loans-panel rounded-[2rem] p-6 lg:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My books & active access</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Books you can currently read, remaining access time, and direct reader access.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activeLoans.length + ownedContributionBooks.length} available</span>
              </div>

              <div className="mt-6 space-y-4">
                {activeLoans.length > 0 || ownedContributionBooks.length > 0 ? (
                  <>
                  {activeLoans.map((loan) => {
                    const dueDate = loan.due_date ? new Date(loan.due_date) : null
                    const diffDays = dueDate ? Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24)) : null
                    const isUrgent = diffDays !== null && diffDays <= 3

                    return (
                      <div key={loan.id} className="loan-row rounded-[1.25rem] border border-paper-300 bg-paper-50/70 p-5 dark:border-forest-800 dark:bg-forest-800/40">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</p>
                              {loan.pdf_url ? (
                                <span className="rounded-full bg-pine-100 px-2 py-0.5 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                                  PDF
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Unlocked: {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'} • Expires: {dueDate ? dueDate.toLocaleDateString() : 'N/A'}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isUrgent
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-pine-100 text-pine-700 dark:bg-forest-700 dark:text-pine-200'
                              }`}>
                                {diffDays !== null
                                  ? `${diffDays} days left`
                                  : 'Active'}
                              </span>
                            </div>

                            {loan.pdf_url ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/reader/${loan.book_id}`)}
                                className="pine-action inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition hover:opacity-90"
                              >
                                Read Now &rarr;
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleLoanAction(loan.id)}
                              disabled={loanActionId !== null || (loan.renewal_count ?? 0) >= 2}
                              className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {(loan.renewal_count ?? 0) >= 2 ? 'Renewal limit' : 'Renew'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {ownedContributionBooks.map((book) => (
                    <div key={`contribution-${book.id}`} className="loan-row rounded-[1.25rem] border border-pine-200 bg-pine-50/70 p-5 dark:border-forest-700 dark:bg-forest-800/40">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{book.title}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Your approved contribution · permanent access</p>
                        </div>
                        <button type="button" onClick={() => router.push(`/reader/${book.id}`)} className="pine-action inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition hover:opacity-90">
                          Read Now &rarr;
                        </button>
                      </div>
                    </div>
                  ))}
                  </>
                ) : dataReady ? (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    You do not have any active digital access yet. Explore the collection below to request resources.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="student-side-bento grid gap-6 xl:grid-cols-2">
            <div id="requests" className="side-panel rounded-[2rem] p-6 xl:col-span-2 xl:col-start-1 xl:row-start-1">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track the status of your active requests.</p>
              <ul className="mt-6 space-y-3">
                {activeBorrowRequests.length > 0 ? (
                  activeBorrowRequests.map((request) => (
                    <li key={request.id} className="side-row rounded-[1.25rem] px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{request.title ?? `Book #${request.book_id}`}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Requested {request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className={`status-pill rounded-full px-3 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'status-approved'
                            : request.status === 'rejected' || request.status === 'revoked'
                            ? 'status-rejected'
                            : 'status-pending'
                        }`}>
                          {request.status}
                        </span>
                      </div>
                    </li>
                  ))
                ) : dataReady ? (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    Your access requests will appear here.
                  </div>
                ) : null}
              </ul>
            </div>

            <div id="history" className="side-panel rounded-[2rem] p-6 xl:col-span-2 xl:row-start-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reading history</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Most recent returned and rejected book requests.</p>
              <div className="mt-6 space-y-3">
                {readingHistory.length > 0 ? (
                  readingHistory.map((event) => (
                    <div key={event.id} className="side-row rounded-[1.25rem] px-4 py-4">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.action} • {event.date}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No reading history to show yet.
                  </div>
                )}
              </div>
            </div>

          </aside>
        </section>
        </>
        )}
        </main>
      </div>
      <PhysicalBorrowModal
        open={physicalBook !== null}
        book={physicalBook}
        userId={userId}
        activeLoanCount={activePhysicalLoanCount}
        loanLimit={3}
        copyId={physicalCopyId}
        onClose={() => { setPhysicalBook(null); setPhysicalCopyId(null) }}
        onComplete={() => { setDataReloadToken((value) => value + 1) }}
        onViewReceipt={(request) => {
          if (!physicalBook) return
          setPhysicalReceipt({
            id: request.id,
            book_id: physicalBook.id,
            copy_id: null,
            duration_days: request.duration_days,
            fee_amount: request.fee_amount,
            payment_method: 'cash',
            payment_status: request.payment_status as PhysicalLoan['payment_status'],
            status: request.status as PhysicalLoan['status'],
            requested_at: request.requested_at,
            checked_out_at: request.checked_out_at,
            due_date: request.due_date,
            returned_at: null,
            receipt_number: request.receipt_number,
            title: physicalBook.title,
          })
          setPhysicalBook(null)
          setPhysicalCopyId(null)
        }}
      />
      {catalogDetailsBook ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogDetailsBook(null) }}>
          <section className="notification-modal catalog-detail-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-detail-title">
            <div className="notification-modal-header">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">{catalogDetailsBook.category} / {catalogDetailsBook.catalog_type === 'physical' ? 'Physical' : catalogDetailsBook.catalog_type === 'hybrid' ? 'Digital + physical' : 'Digital'}</p>
                <h2 id="catalog-detail-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{catalogDetailsBook.title}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">by {catalogDetailsBook.author}</p>
              </div>
              <button type="button" className="notification-modal-close" onClick={() => setCatalogDetailsBook(null)} aria-label="Close book details">×</button>
            </div>
            <div className="catalog-detail-content">
              <div className="resource-cover catalog-detail-cover">
                <div className="resource-cover-placeholder" aria-hidden="true"><span className="resource-cover-mark"><img src="/mary-the-queen-college-crest.jpg" alt="" /></span><span>{catalogDetailsBook.category}</span></div>
                {catalogDetailsBook.cover_image_url ? <img className="resource-cover-image" src={catalogDetailsBook.cover_image_url} alt={`${catalogDetailsBook.title} cover`} onError={(event) => { event.currentTarget.remove() }} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{catalogDetailsBook.description || 'No description is available for this title yet.'}</p>
                <dl className="catalog-detail-meta">
                  <div><dt>ISBN</dt><dd>{catalogDetailsBook.isbn || 'Not listed'}</dd></div>
                  <div><dt>Access</dt><dd>{catalogDetailsBook.access_mode === 'premium' ? 'Staff verified payment' : catalogDetailsBook.access_mode === 'points' ? 'Points access' : 'Automatic access'}</dd></div>
                  {catalogDetailsBook.catalog_type !== 'digital' ? <div className="catalog-detail-stock"><dt>Physical copies</dt><dd>{catalogDetailsBook.physical_available_copies ?? 0} available / {catalogDetailsBook.physical_borrowed_copies ?? 0} borrowed / {catalogDetailsBook.physical_registered_copies ?? 0} total</dd><p>{catalogDetailsBook.physical_locations?.length ? `Location: ${catalogDetailsBook.physical_locations.join(', ')}` : 'Location has not been assigned yet.'}</p></div> : null}
                </dl>
                {catalogDetailsBook.pdf_url && catalogDetailsBook.catalog_type !== 'physical' ? <p className="catalog-detail-ready">Digital file available</p> : null}
              </div>
            </div>
            <div className="catalog-detail-actions">
              {catalogDetailsBook.catalog_type !== 'physical' ? <button type="button" className="pine-action" disabled={requestingBookId !== null} onClick={() => {
                const book = catalogDetailsBook
                setCatalogDetailsBook(null)
                setDurationDays(String(DIGITAL_ACCESS_DURATION_OPTIONS.includes(book.access_duration_days as typeof DIGITAL_ACCESS_DURATION_OPTIONS[number]) ? book.access_duration_days : 30))
                if (book.access_mode === 'premium') {
                  setPremiumReference(`DEMO-GCASH-${Date.now().toString().slice(-8)}`)
                  setPremiumProofFile(null)
                  setPremiumSimulationConfirmed(false)
                }
                setSelectedBook(book)
                setRequestStatus(null)
              }}>Request digital access</button> : null}
              {catalogDetailsBook.catalog_type !== 'digital' ? <button type="button" className="secondary-action" onClick={() => {
                const book = catalogDetailsBook
                setCatalogDetailsBook(null)
                setPhysicalBook({ id: book.id, title: book.title, author: book.author, category: book.category, catalog_type: book.catalog_type === 'physical' ? 'physical' : 'hybrid' })
              }}>{catalogDetailsBook.catalog_type === 'physical' ? 'Browse copies & request' : 'Browse physical copies'}</button> : null}
              {catalogDetailsBook.catalog_type !== 'digital' && (catalogDetailsBook.physical_available_copies ?? 0) === 0 ? (() => {
                const book = catalogDetailsBook
                const subscribed = availabilityAlerts.some((alert) => alert.book_id === book.id)
                return <button type="button" aria-pressed={subscribed} disabled={availabilityAlertSavingBookId === book.id} onClick={() => void togglePhysicalAvailabilityAlert(book)} className="secondary-action catalog-detail-alert"><BellIcon />{availabilityAlertSavingBookId === book.id ? 'Saving...' : subscribed ? 'Turn off availability alert' : 'Notify me when available'}</button>
              })() : null}
            </div>
          </section>
        </div>
      ) : null}
      {selectedBook ? (
        <div className="access-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBook(null) }}>
          <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Unlock access</p>
                <h2 id="access-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedBook.title}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedBook.access_mode === 'premium' ? 'Submit payment evidence for staff verification. Permanent access is granted after approval.' : 'Choose how long you need this digital resource. Access unlocks immediately.'}</p>
              </div>
              <button type="button" onClick={() => setSelectedBook(null)} className="notification-modal-close" aria-label="Close access request">×</button>
            </div>

            {selectedBook.access_mode !== 'premium' ? <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(String(days))}
                  aria-pressed={durationDays === String(days)}
                  className="access-duration-option rounded-2xl border px-4 py-3 text-left transition"
                >
                  <span className="block text-sm font-semibold">{days} {days === 1 ? 'day' : 'days'}</span>
                  <span className="access-duration-caption mt-1 block text-xs">Configured access period</span>
                </button>
              ))}
            </div> : null}

            {selectedBook.access_mode === 'premium' ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Checkout simulation</p>
              <p className="mt-1 text-xs leading-5">This is a capstone demo only. No real GCash account or payment gateway is connected. The request will remain pending until an administrator reviews it.</p>
              <label className="mt-3 flex items-start gap-2 text-xs leading-5">
                <input type="checkbox" checked={premiumSimulationConfirmed} onChange={(event) => setPremiumSimulationConfirmed(event.target.checked)} className="mt-1" />
                <span>I understand this is a simulated payment and not a real charge.</span>
              </label>
            </div> : null}

            {selectedBook.access_mode === 'premium' ? <div className="mt-5 space-y-3 rounded-2xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/70"><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-slate-800 dark:text-slate-100">Premium price</span><span className="font-semibold text-pine-700 dark:text-pine-200">₱{Number(selectedBook.premium_price).toFixed(2)}</span></div><label className="block text-sm font-medium">Demo GCash reference<input value={premiumReference} onChange={(event) => setPremiumReference(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><label className="block text-sm font-medium">Sample payment receipt<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPremiumProofFile(event.target.files?.[0] ?? null)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><p className="text-xs leading-5 text-slate-500 dark:text-slate-300">A demo reference is generated for you. Upload a sample receipt image so the administrator can practice reviewing the checkout evidence.</p></div> : <div className="mt-5 rounded-2xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/70">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Access terms</span>
                <span className="font-semibold text-pine-700 dark:text-pine-200">
                  {selectedBook.access_mode === 'free' ? 'Free access' : `${getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points)} points`}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">Your balance: <strong>{profile?.points_balance ?? 0} points</strong>. Access unlocks automatically when your balance covers the selected period.</p>
              {selectedBook.access_mode === 'points' && getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points) > (profile?.points_balance ?? 0) ? <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">You need {getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points) - (profile?.points_balance ?? 0)} more points to unlock this resource.</p> : null}
            </div>}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelectedBook(null)} className="secondary-action rounded-2xl border px-4 py-3 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => void (selectedBook.access_mode === 'premium' ? submitPremiumPurchase() : submitAccessRequest())} disabled={requestingBookId !== null || premiumPurchaseSaving || (selectedBook.access_mode === 'points' && getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points) > (profile?.points_balance ?? 0))} className="pine-action rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                {requestingBookId === selectedBook.id || premiumPurchaseSaving ? 'Submitting...' : selectedBook.access_mode === 'premium' ? `Simulate GCash payment · ₱${Number(selectedBook.premium_price).toFixed(2)}` : selectedBook.access_mode === 'points' ? `Unlock for ${getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points)} points` : 'Unlock free access'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {memberType === 'faculty' && contributionOpen ? (
        <div className="access-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContributionOpen(false) }}>
          <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="contribution-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Community library</p>
                <h2 id="contribution-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Suggest a resource</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">An administrator reviews every submission before it enters the catalog.</p>
              </div>
              <button type="button" onClick={() => setContributionOpen(false)} className="notification-modal-close" aria-label="Close resource form">×</button>
            </div>
            <form onSubmit={handleContributionSubmit} className="mt-6 space-y-4">
              <input required value={contributionForm.title} onChange={(event) => setContributionForm({ ...contributionForm, title: event.target.value })} placeholder="Book title" className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <input required value={contributionForm.author} onChange={(event) => setContributionForm({ ...contributionForm, author: event.target.value })} placeholder="Author" className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <textarea value={contributionForm.description} onChange={(event) => setContributionForm({ ...contributionForm, description: event.target.value })} placeholder="Document subject or why this is useful for the library" rows={3} className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <label className="block"><span className="text-sm font-medium">PDF file</span><input required type="file" accept="application/pdf,.pdf" onChange={(event) => void handleContributionFileSelected(event.target.files?.[0] ?? null)} className="workspace-input mt-2 block w-full rounded-2xl border border-dashed px-4 py-3 text-sm" /><span className="mt-1 block text-xs text-slate-500">PDF only, maximum 50 MB. Title, author, and subject are filled from PDF metadata when available.</span></label>
              {contributionMetadataStatus ? <p aria-live="polite" className="text-xs text-slate-600 dark:text-slate-300">{contributionMetadataStatus}</p> : null}
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-300">Approved contributions earn points set by the administrator. Do not submit copyrighted material unless the library has permission to store and share it.</p>
              {contributionStatus ? <p className="rounded-xl border border-paper-300 bg-paper-50 p-3 text-sm text-slate-700 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100">{contributionStatus}</p> : null}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setContributionOpen(false)} className="secondary-action rounded-2xl border px-4 py-3 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={contributionSubmitting} className="pine-action rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{contributionSubmitting ? 'Submitting...' : 'Submit for review'}</button>
              </div>
              <button type="button" onClick={() => router.push('/contributions')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">View contribution history and revisions</button>
            </form>
          </section>
        </div>
      ) : null}
      {scannerOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScannerOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-modal-title">
            <div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Physical collection</p><h2 id="scanner-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Scan book QR</h2></div><button type="button" className="notification-modal-close" onClick={() => setScannerOpen(false)} aria-label="Close QR scanner">×</button></div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Point your camera at a Mary the Queen College copy sticker. The matching book will open in the catalog.</p>
            <video ref={scannerVideoRef} className="mt-5 aspect-video w-full rounded-2xl bg-slate-950 object-cover" autoPlay muted playsInline />
            {scannerError ? <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{scannerError}</p> : null}
            {!scannerError && scannerStatus ? <p aria-live="polite" className="mt-4 text-sm text-slate-600 dark:text-slate-300">{scannerStatus}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startPhysicalQrScanner()}
                disabled={scannerStarting || scannerStarted}
                className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scannerStarting ? 'Requesting camera...' : scannerStarted ? 'Camera active' : 'Start camera'}
              </button>
              <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                Choose QR image
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Choose an image containing a Mary the Queen College QR code"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void scanQrImage(file)
                  }}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Select Start camera to request browser permission. If access was blocked earlier, allow Camera for this site from the browser’s address-bar controls, then try again. Camera access needs HTTPS or localhost.</p>
          </section>
        </div>
      ) : null}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <WalletModal open={walletOpen} balance={profile?.points_balance ?? 0} onClose={() => setWalletOpen(false)} onOpenDetails={() => router.push('/points')} />
      <ActionModal
        open={confirmAction !== null}
        title="Renew e-book access?"
        confirmLabel="Renew access"
        busy={loanActionId !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction
          setConfirmAction(null)
          if (action?.type === 'renew') void executeRenewLoan(action.id)
        }}
      />
      {feedbackModal ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFeedbackModal(null) }}>
          <section className="notification-modal action-feedback-modal" role="alertdialog" aria-modal="true" aria-labelledby="action-feedback-title" aria-describedby="action-feedback-message">
            <div className="notification-modal-header">
              <div>
                <p className={`action-feedback-eyebrow action-feedback-${feedbackModal.tone}`}>
                  {feedbackModal.tone === 'success' ? 'Completed' : feedbackModal.tone === 'error' ? 'Needs attention' : 'Update'}
                </p>
                <h2 id="action-feedback-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{feedbackModal.title}</h2>
              </div>
              <button type="button" className="notification-modal-close" onClick={() => setFeedbackModal(null)} aria-label="Close message">×</button>
            </div>
            <p id="action-feedback-message" className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{feedbackModal.message}</p>
            <button type="button" autoFocus onClick={() => setFeedbackModal(null)} className="pine-action mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold">Done</button>
          </section>
        </div>
      ) : null}
      {continueReadingOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContinueReadingOpen(false) }}>
          <section className="notification-modal continue-reading-modal" role="dialog" aria-modal="true" aria-labelledby="continue-reading-modal-title">
            <div className="notification-modal-header">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Reading space</p>
                <h2 id="continue-reading-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Continue reading</h2>
              </div>
              <button type="button" className="notification-modal-close" onClick={() => setContinueReadingOpen(false)} aria-label="Close continue reading">×</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">Resume an active e-book from the page you last visited. Access ends automatically at its due date.</p>
              <button type="button" onClick={() => { setContinueReadingOpen(false); setActiveAccessOpen(true) }} className="text-left text-sm font-semibold text-pine-700 hover:underline dark:text-pine-200">Open my library</button>
            </div>
            {continueReading.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {continueReading.map((loan) => {
                  const progress = readingProgress[loan.book_id]
                  const page = progress?.current_page ?? lastReadPages[loan.book_id] ?? 1
                  const totalPages = progress?.total_pages ?? books.find((book) => book.id === loan.book_id)?.page_count ?? null
                  const percentage = totalPages ? Math.min(100, Math.round((page / totalPages) * 100)) : null
                  return <article key={`${loan.isOwner ? 'contribution' : 'loan'}-${loan.id}`} className="continue-reading-card rounded-2xl border border-paper-300 bg-paper-100/70 p-4 dark:border-forest-700 dark:bg-forest-800/60">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{loan.isOwner ? 'Your contribution · permanent access' : `Last opened page ${page}${totalPages ? ` of ${totalPages}` : ''}`}</p></div><span className="rounded-full bg-pine-100 px-2 py-1 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">{loan.isOwner ? 'Permanent' : percentage === null ? 'Active' : `${percentage}%`}</span></div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-300 dark:bg-forest-700"><span className="block h-full rounded-full bg-pine-500" style={{ width: `${percentage ?? 0}%` }} /></div>
                    <button type="button" onClick={() => router.push(`/reader/${loan.book_id}`)} className="pine-action mt-4 w-full rounded-xl px-3 py-2 text-xs font-semibold">Resume reading</button>
                  </article>
                })}
              </div>
            ) : <div className="mt-5 rounded-2xl border border-dashed border-paper-300 bg-paper-100/60 p-5 text-sm text-slate-600 dark:border-forest-700 dark:bg-forest-800/50 dark:text-slate-300">Unlock an e-book to see it here while your access is active.</div>}
          </section>
        </div>
      ) : null}
      {activeAccessOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveAccessOpen(false) }}>
          <section className="notification-modal active-access-modal" role="dialog" aria-modal="true" aria-labelledby="my-library-modal-title">
            <div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Reading space</p><h2 id="my-library-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">My library</h2></div><button type="button" className="notification-modal-close" onClick={() => setActiveAccessOpen(false)} aria-label="Close my library">×</button></div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your active e-book access and permanent access to your approved contributions.</p>
            <div className="active-access-list">
              {activeLoans.length > 0 || ownedContributionBooks.length > 0 ? <>
                {activeLoans.map((loan) => {
                const dueDate = loan.due_date ? new Date(loan.due_date) : null
                const diffDays = dueDate ? Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24)) : null
                const isUrgent = diffDays !== null && diffDays <= 3
                return <article key={loan.id} className="active-access-item"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Unlocked {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'} · Expires {dueDate ? dueDate.toLocaleDateString() : 'N/A'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isUrgent ? 'bg-amber-100 text-amber-900' : 'bg-pine-100 text-pine-700'}`}>{diffDays !== null ? `${diffDays} days left` : 'Active'}</span></div><div className="mt-3 flex flex-wrap gap-2">{loan.pdf_url ? <button type="button" onClick={() => { setActiveAccessOpen(false); router.push(`/reader/${loan.book_id}`) }} className="pine-action rounded-xl px-3 py-2 text-xs font-semibold">Read now</button> : null}<button type="button" onClick={() => void handleLoanAction(loan.id)} disabled={loanActionId !== null || (loan.renewal_count ?? 0) >= 2} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">{(loan.renewal_count ?? 0) >= 2 ? 'Renewal limit' : 'Renew'}</button></div></article>
                })}
                {ownedContributionBooks.map((book) => <article key={`contribution-${book.id}`} className="active-access-item"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-slate-100">{book.title}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your approved contribution · Permanent access</p></div><span className="rounded-full bg-pine-100 px-2.5 py-1 text-xs font-semibold text-pine-700 dark:bg-forest-700 dark:text-pine-200">Permanent</span></div><div className="mt-3"><button type="button" onClick={() => { setActiveAccessOpen(false); router.push(`/reader/${book.id}`) }} className="pine-action rounded-xl px-3 py-2 text-xs font-semibold">Read now</button></div></article>)}
              </> : <div className="modal-empty-state">You do not have any active digital access yet. Explore the catalog to unlock a resource.</div>}
            </div>
          </section>
        </div>
      ) : null}
      {requestsOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestsOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="requests-modal-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Library activity</p><h2 id="requests-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2></div><button type="button" className="notification-modal-close" onClick={() => setRequestsOpen(false)} aria-label="Close borrow requests">×</button></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track the status of your access requests.</p><div className="modal-record-list">          {activeBorrowRequests.length > 0 ? activeBorrowRequests.map((request) => <div key={request.id} className="modal-record"><div><p className="font-semibold text-slate-900 dark:text-slate-100">{request.title ?? `Book #${request.book_id}`}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Requested {request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</p></div><span className={`status-pill rounded-full px-3 py-1 text-xs font-semibold ${request.status === 'approved' ? 'status-approved' : request.status === 'rejected' || request.status === 'revoked' ? 'status-rejected' : 'status-pending'}`}>{request.status}</span></div>) : <div className="modal-empty-state">Your active access requests will appear here.</div>}</div></section>
        </div>
      ) : null}
      {historyOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Library activity</p><h2 id="history-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Reading history</h2></div><button type="button" className="notification-modal-close" onClick={() => setHistoryOpen(false)} aria-label="Close reading history">×</button></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Returned, expired, revoked, and rejected digital access.</p><div className="modal-record-list">{readingHistory.length > 0 ? readingHistory.map((event) => <div key={event.id} className="modal-record"><div><p className="font-semibold text-slate-900 dark:text-slate-100">{event.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.action} · {event.date}</p></div></div>) : <div className="modal-empty-state">No reading history to show yet.</div>}</div></section>
        </div>
      ) : null}

      {paymentsOpen ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentsOpen(false) }}>
        <section className="notification-modal requests-payments-modal max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="clearance-title">
          <div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Member services</p><h2 id="clearance-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Requests &amp; payments</h2></div><button type="button" className="notification-modal-close" onClick={() => setPaymentsOpen(false)} aria-label="Close requests and payments">×</button></div>
          <div className="requests-payments-intro mt-2"><p className="text-sm text-slate-500 dark:text-slate-400">Track physical borrowing and view receipts issued by library staff.</p><button type="button" onClick={() => { setPaymentsOpen(false); setFinesOpen(true) }} className="secondary-action requests-payments-fines-link rounded-xl border px-3 py-2 text-xs font-semibold">Fines &amp; clearance <span className={`requests-payments-fine-count${unpaidFineCount ? ' has-unpaid' : ''}`}>{unpaidFineCount} unpaid</span></button></div>
          {finesError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{finesError}</p> : null}
          <div className="requests-payments-grid mt-5">
            <section className="requests-payments-physical" aria-labelledby="physical-requests-payments-title"><h3 id="physical-requests-payments-title" className="font-semibold">Physical requests &amp; loans</h3><div className="mt-2 space-y-2">{availabilityAlerts.map((entry) => <article key={`availability-alert-${entry.book_id}`} className="modal-record"><div><p className="font-semibold">{entry.title ?? `Book #${entry.book_id}`}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Availability alert · enabled {new Date(entry.created_at).toLocaleDateString()}</p></div><span className="status-pill rounded-full px-3 py-1 text-xs font-semibold status-pending">Alerts on</span></article>)}{physicalLoans.map((loan) => <article key={`physical-service-${loan.id}`} className="modal-record"><div className="min-w-0"><p className="font-semibold">{loan.title ?? `Book #${loan.book_id}`}</p><p className="mt-1 text-xs capitalize text-slate-500">{loan.status === 'pending' ? 'Waiting for librarian confirmation' : loan.status === 'return_pending' ? 'Return awaiting librarian confirmation' : loan.status.replace('_', ' ')} · {loan.payment_status.replace('_', ' ')} · {loan.payment_method === 'gcash' ? 'GCash' : 'Cash'} · ₱{Number(loan.fee_amount).toFixed(2)}</p><p className="mt-1 text-xs text-slate-500">Requested {new Date(loan.requested_at).toLocaleDateString()}{loan.due_date ? ` · Due ${new Date(loan.due_date).toLocaleDateString()}` : ''}</p>{loan.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt: {loan.receipt_number}</p> : loan.status === 'pending' ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">The receipt will appear here after the librarian confirms checkout.</p> : null}</div>{loan.receipt_number ? <button type="button" onClick={() => setPhysicalReceipt(loan)} className="secondary-action shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold">View receipt</button> : null}</article>)}{physicalLoans.length === 0 && availabilityAlerts.length === 0 ? <div className="modal-empty-state">No physical requests, loans, or availability alerts yet.</div> : null}</div></section>
            {printPayments.length > 0 ? <section><h3 className="font-semibold">Print payments</h3><div className="mt-2 space-y-2">{printPayments.map((payment) => <article key={payment.id} className="modal-record"><div><p className="font-semibold">{payment.description}</p><p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt: {payment.receipt_number}</p></div><button type="button" onClick={() => setMemberReceipt({ title: 'Print-service receipt', receiptNumber: payment.receipt_number, amount: payment.amount, date: payment.created_at, description: payment.description, payment: 'Paid' })} className="secondary-action shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold">View receipt</button></article>)}</div></section> : null}
            {ebookPayments.length > 0 ? <section><h3 className="font-semibold">Digital purchases</h3><div className="mt-2 space-y-2">{ebookPayments.map((payment) => <article key={payment.id} className="modal-record"><div><p className="font-semibold">{books.find((book) => book.id === payment.book_id)?.title ?? `Book #${payment.book_id}`}</p><p className="mt-1 text-xs capitalize text-slate-500">₱{Number(payment.fee_amount).toFixed(2)} · {payment.status}</p>{payment.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt: {payment.receipt_number}</p> : null}</div>{payment.receipt_number ? <button type="button" onClick={() => setMemberReceipt({ title: 'Digital purchase receipt', receiptNumber: payment.receipt_number!, amount: payment.fee_amount, date: payment.requested_at, description: books.find((book) => book.id === payment.book_id)?.title ?? `Book #${payment.book_id}`, payment: payment.status })} className="secondary-action shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold">View receipt</button> : <span className="text-xs text-slate-500">No receipt issued</span>}</article>)}</div></section> : null}
          </div>
        </section>
      </div> : null}
      {finesOpen ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFinesOpen(false) }}>
        <section className="notification-modal max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="fine-clearance-title">
          <div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Member services</p><h2 id="fine-clearance-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Fines &amp; clearance</h2></div><button type="button" className="notification-modal-close" onClick={() => setFinesOpen(false)} aria-label="Close fines and clearance">×</button></div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Outstanding charges and staff-issued receipts. Payments are completed with library staff.</p>
          {clearanceError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{clearanceError}</p> : null}
          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${unpaidFineCount ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'}`}>{unpaidFineCount} unpaid</span>
          <div className="mt-4 space-y-2">
            {clearanceFines.map((fine) => {
              const fineLoan = physicalLoans.find((loan) => loan.id === fine.physical_book_request_id)
              const kind = fine.fine_type === 'late_fee' ? 'Late return' : fine.fine_type === 'lost_item' ? 'Lost item assessment' : fine.fine_type === 'damage' ? 'Damage assessment' : 'Library charge'
              return <article key={fine.id} className="modal-record">
                <div className="min-w-0">
                  <p className="font-semibold">{fineLoan?.title || kind} · ₱{Number(fine.amount).toFixed(2)}</p>
                  {fineLoan?.title ? <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{kind}</p> : null}
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Status: <span className="font-semibold capitalize">{fine.status}</span></p>
                  <p className="mt-1 text-xs text-slate-500">{fine.status === 'waived' ? fine.waiver_reason || 'This charge was waived by library staff.' : fine.fine_reason || 'Library fine'} · {fine.created_at ? new Date(fine.created_at).toLocaleDateString() : 'Date unavailable'}</p>
                  {fine.status === 'unpaid' ? <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">Pay at the library cashier. Staff will record the payment and issue your receipt.</p> : null}
                  {fine.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt: {fine.receipt_number}</p> : null}
                </div>
                {fine.receipt_number ? <button type="button" onClick={() => setMemberReceipt({ title: 'Fine payment receipt', receiptNumber: fine.receipt_number!, amount: fine.amount, date: fine.paid_at ?? fine.created_at, description: fine.fine_reason || kind, payment: fine.status })} className="secondary-action shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold">View receipt</button> : null}
              </article>
            })}
            {clearanceFines.length === 0 ? <p className="modal-empty-state">No fines are recorded for your account. If a book is lost or damaged, contact the librarian to assess and record the case.</p> : null}
          </div>
          <details className="fine-resolution-details mt-4"><summary className="cursor-pointer text-sm font-semibold">How to resolve a fine</summary><div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"><ol className="list-decimal space-y-1 pl-5 text-xs leading-5"><li><strong>Late:</strong> bring the book to the librarian&apos;s desk for return inspection and final charge calculation.</li><li><strong>Damaged:</strong> bring the book to the desk for inspection and assessment.</li><li><strong>Lost:</strong> contact the librarian promptly. If you later find the book, bring it in so staff can resolve the lost record.</li><li>Pay at the library cashier. Staff records the payment; your receipt appears here automatically.</li><li>Ask the librarian to review any disputed assessment. Staff can correct the case or record a waiver.</li></ol><p className="mt-2 text-xs">Late charges follow posted policy and remain separate from damage or lost-item assessments.</p></div></details>
        </section>
      </div> : null}
      {physicalReceipt ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhysicalReceipt(null) }}>
        <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="physical-receipt-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Library receipt</p><h2 id="physical-receipt-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Physical-book receipt</h2></div><button type="button" className="notification-modal-close" onClick={() => setPhysicalReceipt(null)} aria-label="Close physical receipt">×</button></div><div className="mt-5 grid gap-3 rounded-2xl border border-paper-300 bg-paper-50 p-4 text-sm dark:border-forest-700 dark:bg-forest-900/60"><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Receipt number</span><strong className="font-mono text-pine-700 dark:text-pine-200">{physicalReceipt.receipt_number}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Book</span><strong className="text-right text-slate-900 dark:text-slate-100">{physicalReceipt.title}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Amount paid</span><strong>₱{Number(physicalReceipt.fee_amount).toFixed(2)}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Payment</span><span className="capitalize">{physicalReceipt.payment_method} · {physicalReceipt.payment_status.replace('_', ' ')}</span></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Checked out</span><span>{physicalReceipt.checked_out_at ? new Date(physicalReceipt.checked_out_at).toLocaleString() : 'Pending checkout'}</span></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Return date</span><span>{physicalReceipt.due_date ? new Date(physicalReceipt.due_date).toLocaleDateString() : 'Not assigned'}</span></div>{physicalReceipt.transaction_reference ? <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Transaction reference</span><span className="break-all text-right">{physicalReceipt.transaction_reference}</span></div> : null}</div></section>
      </div> : null}
      {memberReceipt ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberReceipt(null) }}>
        <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="member-receipt-title">
          <div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Library receipt</p><h2 id="member-receipt-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{memberReceipt.title}</h2></div><button type="button" className="notification-modal-close" onClick={() => setMemberReceipt(null)} aria-label="Close receipt">×</button></div>
          <div className="mt-5 grid gap-3 rounded-2xl border border-paper-300 bg-paper-50 p-4 text-sm dark:border-forest-700 dark:bg-forest-900/60">
            <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Receipt number</span><strong className="font-mono text-pine-700 dark:text-pine-200">{memberReceipt.receiptNumber}</strong></div>
            <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Description</span><strong className="text-right">{memberReceipt.description}</strong></div>
            <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Amount</span><strong>₱{Number(memberReceipt.amount).toFixed(2)}</strong></div>
            <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Status</span><span className="capitalize">{memberReceipt.payment}</span></div>
            <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Date</span><span>{memberReceipt.date ? new Date(memberReceipt.date).toLocaleDateString() : 'Date unavailable'}</span></div>
          </div>
        </section>
      </div> : null}
      {notificationsOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNotificationsOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-modal-title">
            <div className="notification-modal-header">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Updates</p>
                <h2 id="notification-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Notifications</h2>
              </div>
              <button type="button" className="notification-modal-close" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Important alerts for your borrowed books.</p>
            {notificationError ? <div role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><p>{notificationError}</p><button type="button" className="mt-2 font-semibold underline" onClick={() => setNotificationReloadToken((current) => current + 1)}>Retry</button></div> : null}
            <ul className="mt-6 space-y-3">
              {systemNotifications.slice(0, 5).map((notification) => <li key={`system-${notification.id}`} className="rounded-[1.5rem] border border-pine-200 bg-pine-50 px-4 py-4 text-sm text-pine-900 dark:border-forest-700 dark:bg-forest-800/60 dark:text-paper-100"><div className="flex items-start justify-between gap-3"><div><strong>{notification.title}</strong><p className="mt-1">{notification.message}</p></div>{!notification.read_at ? <button type="button" className="text-xs font-semibold underline" onClick={() => void markNotificationRead(notification.id)}>Mark read</button> : null}</div></li>)}
              {borrowRequests.filter((request) =>
                request.status === 'pending' ||
                (request.status === 'approved' && !request.returned_date && Boolean(request.due_date && new Date(request.due_date).getTime() > clock && Math.ceil((new Date(request.due_date).getTime() - clock) / (1000 * 60 * 60 * 24)) <= 3))
              ).slice(0, 3).map((request) => {
                const dueDate = request.due_date ? new Date(request.due_date) : null
                const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24)) : null
                return <li key={`notification-${request.id}`} className={`${request.status === 'pending' ? 'status-pending' : 'status-approved'} rounded-[1.5rem] border px-4 py-4 text-sm`}>{request.status === 'pending' ? `Your access request for ${request.title ?? 'a resource'} is waiting for approval.` : daysLeft !== null && daysLeft <= 3 ? `${request.title ?? 'Your resource'} expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'}.` : `Digital access is active for ${request.title ?? 'your resource'}.`}</li>
              })}
              {borrowRequests.every((request) =>
                request.status !== 'pending' &&
                !(request.status === 'approved' && !request.returned_date && request.due_date && new Date(request.due_date).getTime() > clock && Math.ceil((new Date(request.due_date).getTime() - clock) / (1000 * 60 * 60 * 24)) <= 3)
              ) ? <li className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">Your borrowing notifications will appear here.</li> : null}
            </ul>
            {fines.length > 0 ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">Unpaid fines: <strong>₱{fines.reduce((total, fine) => total + Number(fine.amount), 0).toFixed(2)}</strong>{fines.filter((fine) => fine.fine_reason).map((fine) => <p key={fine.id} className="mt-1 text-xs">{fine.fine_reason}</p>)}<span className="mt-1 block">Settle physical-book fines with the library cashier. Digital loans do not accrue overdue fines.</span></div> : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
