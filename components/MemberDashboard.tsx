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
  access_points: number
  access_costs: DigitalAccessCosts | null
  access_mode: CanonicalAccessMode
  premium_price: number
  access_duration_days: number
  page_count?: number | null
  pdf_url?: string | null
  catalog_type: 'digital' | 'physical' | 'hybrid'
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

type Fine = { id: number; amount: number; status: string; created_at: string | null }
type SystemNotification = { id: number; title: string; message: string; read_at: string | null; created_at: string }
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
type PhysicalWaitlist = { book_id: number; created_at: string; title?: string }
function LineIcon({ children }: { children: React.ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

function DashboardIcon() { return <LineIcon><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></LineIcon> }
function BookIcon() { return <LineIcon><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></LineIcon> }
function BookMarkIcon() { return <LineIcon><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2H19v19l-5-3-5 3V4.5A2.5 2.5 0 0 0 6 4.5Z" /></LineIcon> }
function AccessIcon() { return <LineIcon><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></LineIcon> }
function RequestIcon() { return <LineIcon><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></LineIcon> }
function HistoryIcon() { return <LineIcon><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6M12 8v4l2.5 1.5" /></LineIcon> }
function ProfileIcon() { return <LineIcon><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></LineIcon> }
function LogoutIcon() { return <LineIcon><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></LineIcon> }
function MenuIcon() { return <LineIcon><path d="M4 6h16M4 12h16M4 18h16" /></LineIcon> }
function BellIcon() { return <LineIcon><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></LineIcon> }
function SearchIcon() { return <LineIcon><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.2 4.2" /></LineIcon> }
function FilterIcon() { return <LineIcon><path d="M4 6h16M7 12h10M10 18h4" /></LineIcon> }
function SortIcon() { return <LineIcon><path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" /></LineIcon> }
function CloseIcon() { return <LineIcon><path d="m6 6 12 12M18 6 6 18" /></LineIcon> }

export default function MemberDashboard({ memberType }: { memberType: 'student' | 'faculty' }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 200)
  const [catalogSort, setCatalogSort] = useState<'relevance' | 'title' | 'author' | 'newest'>('relevance')
  const [catalogControlsOpen, setCatalogControlsOpen] = useState(false)
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [physicalLoans, setPhysicalLoans] = useState<PhysicalLoan[]>([])
  const [physicalWaitlist, setPhysicalWaitlist] = useState<PhysicalWaitlist[]>([])
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  const [requestingBookId, setRequestingBookId] = useState<number | null>(null)
  const [premiumReference, setPremiumReference] = useState('')
  const [premiumProofFile, setPremiumProofFile] = useState<File | null>(null)
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
  const [physicalHistoryOpen, setPhysicalHistoryOpen] = useState(false)
  const [physicalReceipt, setPhysicalReceipt] = useState<PhysicalLoan | null>(null)
  const [physicalReturnPickerOpen, setPhysicalReturnPickerOpen] = useState(false)
  const [physicalReturnActionId, setPhysicalReturnActionId] = useState<number | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null)
  const [continueReadingOpen, setContinueReadingOpen] = useState(false)
  const [activeAccessOpen, setActiveAccessOpen] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loanActionId, setLoanActionId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'renew' | 'return'; id: number } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fines, setFines] = useState<Fine[]>([])
  const [finesLoaded, setFinesLoaded] = useState(false)
  const [readingProgressLoaded, setReadingProgressLoaded] = useState(false)
  const [clock, setClock] = useState(0)
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([])
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [notificationReloadToken, setNotificationReloadToken] = useState(0)
  const [contributionOpen, setContributionOpen] = useState(false)
  const [contributionSubmitting, setContributionSubmitting] = useState(false)
  const [contributionStatus, setContributionStatus] = useState<string | null>(null)
  const [contributionForm, setContributionForm] = useState({ title: '', author: '', description: '', pdfUrl: '' })
  const [contributionFile, setContributionFile] = useState<File | null>(null)
  const [lastReadPages, setLastReadPages] = useState<Record<number, number>>({})
  const [readingProgress, setReadingProgress] = useState<Record<number, { current_page: number; total_pages: number | null }>>({})
  const [dataReloadToken, setDataReloadToken] = useState(0)

  useEffect(() => {
    setClock(Date.now())
    const interval = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!notificationsOpen && !continueReadingOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        setContinueReadingOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [notificationsOpen, continueReadingOpen])

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
    let active = true
    let stream: MediaStream | null = null
    let timer: number | null = null
    const startScanner = async () => {
      type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> }
      type DetectorConstructor = new (options?: { formats?: string[] }) => Detector
      const BarcodeDetectorApi = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
      if (!BarcodeDetectorApi) {
        setScannerError('QR scanning is not supported by this browser. Use the QR sticker link or open the catalog manually.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerError('Camera access is not available in this browser.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active || !scannerVideoRef.current) return
        scannerVideoRef.current.srcObject = stream
        await scannerVideoRef.current.play()
        const detector = new BarcodeDetectorApi({ formats: ['qr_code'] })
        const scan = async () => {
          if (!active || !scannerVideoRef.current) return
          try {
            const results = await detector.detect(scannerVideoRef.current)
            const rawValue = results[0]?.rawValue
            if (rawValue) {
              const url = new URL(rawValue, window.location.origin)
              if (url.searchParams.has('copy')) {
                window.location.href = `${url.pathname}${url.search}${url.hash || '#explore'}`
                return
              }
            }
          } catch { /* The camera may not have a frame ready yet. */ }
          timer = window.setTimeout(() => void scan(), 500)
        }
        void scan()
      } catch (cause) {
        setScannerError(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access to scan a physical-copy QR code.' : 'Unable to open the camera for QR scanning.')
      }
    }
    void startScanner()
    return () => {
      active = false
      if (timer !== null) window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [scannerOpen])

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
    if (!userId || !notificationsOpen || finesLoaded) return
    getSupabase().from('fines').select('id, amount, status, created_at').eq('student_id', userId).eq('status', 'unpaid').order('created_at', { ascending: false }).then(({ data }) => {
      setFines((data ?? []) as Fine[])
      setFinesLoaded(true)
    })
  }, [userId, notificationsOpen, finesLoaded])

  useEffect(() => {
    if (!notificationsOpen) return
    const unreadNotifications = systemNotifications.slice(0, 5).filter((notification) => !notification.read_at)
    if (unreadNotifications.length === 0) return
    void Promise.all(unreadNotifications.map((notification) => markNotificationRead(notification.id)))
  }, [notificationsOpen, systemNotifications])

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
        setLoadError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
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

      const [booksResult, requestsResult, physicalLoansResult, contributionResult, physicalCatalogResult, physicalWaitlistResult] = await Promise.all([
        supabase
          .from('books')
          .select('id, title, author, category, description, isbn, access_points, access_costs, access_mode, premium_price, access_duration_days, page_count, pdf_url, catalog_type')
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
        setLoadError(`Unable to load your library data. Apply the required Supabase schema, then try again. (${requiredError.message})`)
        return
      }
      if (physicalLoansResult.error && !isMissingTableError(physicalLoansResult)) {
        setLoadError(`Unable to load physical lending data. (${physicalLoansResult.error.message})`)
        return
      }
      if (physicalWaitlistResult.error && !isMissingTableError(physicalWaitlistResult)) {
        setLoadError(`Unable to load physical availability queue. (${physicalWaitlistResult.error.message})`)
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
        isOwner: ownedContributionBookIds.has(book.id),
        physical_registered_copies: physicalCatalog.get(book.id)?.registered_copies ?? 0,
        physical_available_copies: physicalCatalog.get(book.id)?.available_copies ?? 0,
        physical_borrowed_copies: physicalCatalog.get(book.id)?.borrowed_copies ?? 0,
        physical_locations: physicalCatalog.get(book.id)?.locations ?? null,
      }))

      const bookLookup = new Map<number, Book>(fetchedBooks.map((b) => [b.id, b]))
      setBooks(fetchedBooks)
      setPhysicalWaitlist((physicalWaitlistResult.data ?? []).map((entry: PhysicalWaitlist) => ({
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

  const categories = useMemo(() => {
    const set = new Set<string>()
    books.forEach((b) => {
      if (b.category && b.category.trim()) set.add(b.category.trim())
    })
    return ['All', ...Array.from(set)]
  }, [books])

  const filteredBooks = useMemo(
    () => {
      const activeSearch = (query || debouncedSearch).trim().toLowerCase()
      const searchTokens = activeSearch ? activeSearch.split(/\s+/) : []

      const results = books
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
    [books, query, debouncedSearch, selectedCategory, selectedFormat, catalogSort]
  )

  const activeLoans = useMemo(
    () => borrowRequests.filter((request) =>
      request.status === 'approved' &&
      !request.returned_date &&
      Boolean(request.due_date && new Date(request.due_date).getTime() > clock)
    ),
    [borrowRequests, clock]
  )

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
    () => activeLoans.filter((loan) => loan.pdf_url),
    [activeLoans]
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
    if (book.access_mode === 'premium') {
      setRequestStatus('Paid e-book checkout is temporarily unavailable. Choose a free or points-based e-book instead.')
      return
    }
    setRequestingBookId(book.id)
    setRequestStatus(null)

    const response = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: book.id, durationDays: Number(durationDays) }),
    })
    const data = await response.json()

    if (!response.ok) {
      setRequestStatus(data.error || 'Something went wrong while requesting digital access.')
    } else {
      setRequestStatus(data.status === 'approved'
        ? `Access unlocked for ${book.title} for ${durationDays} days. You can start reading now.`
        : `Access requested for ${book.title} for ${durationDays} days.`)
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
    }

    setRequestingBookId(null)
    setSelectedBook(null)
  }

  const submitPremiumPurchase = async () => {
    if (!selectedBook || selectedBook.access_mode !== 'premium' || !userId) return
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
      setRequestStatus(`Payment submitted for ${selectedBook.title}. Staff will verify it before permanent access is granted.`)
      setPremiumReference('')
      setPremiumProofFile(null)
      setSelectedBook(null)
    } catch (cause) {
      if (proofPath) await supabase.storage.from('ebook-payment-proofs').remove([proofPath])
      setRequestStatus(cause instanceof Error ? cause.message : 'Unable to submit the premium e-book payment.')
    } finally {
      setPremiumPurchaseSaving(false)
    }
  }

  const executeRenewLoan = async (loanId: number) => {
    const loan = borrowRequests.find((request) => request.id === loanId)
    if (!loan || loan.status !== 'approved' || loan.returned_date) {
      setRequestStatus('This e-book is no longer available for renewal.')
      return
    }
    setLoanActionId(loanId)
    setRequestStatus(null)
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('renew_digital_loan', { request_id: loanId, extension_days: 14 })
    if (error) {
      setRequestStatus(error.message)
    } else {
      setBorrowRequests((current) => current.map((request) => request.id === loanId ? { ...request, ...data } : request))
      setRequestStatus('Access renewed for 14 more days.')
    }
    setLoanActionId(null)
  }

  const executeReturnLoan = async (loanId: number) => {
    const loan = borrowRequests.find((request) => request.id === loanId)
    if (!loan || loan.status !== 'approved' || loan.returned_date) {
      setRequestStatus('This e-book has already been returned or is no longer active.')
      return
    }
    setLoanActionId(loanId)
    setRequestStatus(null)
    try {
      const response = await fetch('/api/loans/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: loanId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to return this e-book.')
      setBorrowRequests((current) => current.map((request) => request.id === loanId ? { ...request, ...result.loan } : request))
      setRequestStatus('E-book returned successfully.')
    } catch (error) {
      setRequestStatus(error instanceof Error ? error.message : 'Unable to return this e-book.')
    } finally {
      setLoanActionId(null)
    }
  }

  const handleLoanAction = (loanId: number) => setConfirmAction({ type: 'renew', id: loanId })
  const handleReturnLoan = (loanId: number) => setConfirmAction({ type: 'return', id: loanId })
  const requestPhysicalReturn = async (loanId: number) => {
    setPhysicalReturnActionId(loanId)
    const { error } = await getSupabase().rpc('request_physical_return', { p_request_id: loanId })
    if (error) setLoadError(`Unable to request the physical-book return. (${error.message})`)
    setPhysicalReturnActionId(null)
    if (!error) setDataReloadToken((token) => token + 1)
  }

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
      setDataReloadToken((value) => value + 1)
    } catch (error) {
      setContributionStatus(error instanceof Error ? error.message : 'Unable to submit contribution.')
    } finally {
      setContributionSubmitting(false)
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
            <a className="active" href="#overview" onClick={() => setSidebarOpen(false)}><DashboardIcon /><span>Overview</span></a>
            <button type="button" onClick={() => { setActiveAccessOpen(true); setSidebarOpen(false) }}><BookMarkIcon /><span>My library</span></button>
            <a href="#explore" onClick={() => setSidebarOpen(false)}><BookIcon /><span>Catalog</span></a>
            <button type="button" onClick={() => { setContributionStatus(null); setContributionOpen(true); setSidebarOpen(false) }}><BookIcon /><span>Contribute material</span></button>
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
              {memberType === 'faculty' && profile?.department ? <p className="mt-2 text-xs font-semibold text-pine-700 dark:text-pine-200">Department · {profile.department}</p> : null}
            </div>
            <div className="student-hero-actions">
              <button type="button" onClick={() => setRequestsOpen(true)} className="student-notification-button" aria-label="Open borrow requests" title="Borrow requests"><RequestIcon />{borrowRequests.filter((request) => request.status === 'pending').length > 0 ? <span className="student-notification-badge" aria-hidden="true">{borrowRequests.filter((request) => request.status === 'pending').length}</span> : null}</button>
              <button type="button" onClick={() => setContinueReadingOpen(true)} className="student-notification-button" aria-label="Continue reading" title="Continue reading"><BookIcon /></button>
              <button type="button" onClick={() => setHistoryOpen(true)} className="student-notification-button" aria-label="Open reading history" title="Reading history"><HistoryIcon /></button>
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
        <div className="student-analytics-strip grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="student-stat-card rounded-2xl border border-pine-200 bg-pine-50 p-5 shadow-sm dark:border-forest-700 dark:bg-forest-800/70">
            <span className="text-xs font-semibold uppercase tracking-wider text-pine-700 dark:text-pine-200">Points balance</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{profile?.points_balance ?? 0}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">points</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setWalletOpen(true)} className="rounded-xl bg-forest-900 px-3 py-2 text-xs font-semibold text-paper-100 hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900">Wallet</button>
            </div>
          </div>

          <div className="student-stat-card rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Physical lending</span>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{physicalLoans.filter((loan) => loan.status === 'checked_out').length}</span><span className="text-xs text-slate-500 dark:text-slate-400">active loans</span></div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{physicalLoans.length} request{physicalLoans.length === 1 ? '' : 's'}, {physicalWaitlist.length} availability queue{physicalWaitlist.length === 1 ? '' : 's'}</p>
            {physicalLoans.some((loan) => loan.status === 'pending') ? <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{physicalLoans.filter((loan) => loan.status === 'pending').length} request{physicalLoans.filter((loan) => loan.status === 'pending').length === 1 ? '' : 's'} waiting for librarian confirmation.</p> : null}
            {physicalLoans[0]?.receipt_number ? <p className="mt-2 truncate font-mono text-xs text-pine-700 dark:text-pine-200">Latest: {physicalLoans[0].receipt_number}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setPhysicalHistoryOpen(true)} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold">View requests & receipts</button>{physicalLoans.some((loan) => loan.status === 'checked_out') ? <button type="button" onClick={() => setPhysicalReturnPickerOpen(true)} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold">Request return</button> : null}</div>
          </div>

          <div className="student-stat-card rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reading History
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {borrowRequests.filter((r) => r.status === 'returned').length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">books completed</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {borrowRequests.length} lifetime requests
            </p>
          </div>

        </div>

        <section className="student-content-grid grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div id="explore" className="catalog-panel rounded-[2rem] p-6 lg:p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog & discovery</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search digital and physical library materials in one catalog.</p>
                  <div className="catalog-heading-actions mt-4">
                  <button type="button" onClick={() => { setContributionStatus(null); setContributionOpen(true) }} className="secondary-action inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"><BookIcon /><span>Contribute material</span></button>
                  <button type="button" onClick={() => { setScannerError(''); setScannerOpen(true) }} className="secondary-action inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"><span aria-hidden="true">▣</span><span>Scan book QR</span></button>
                  <button type="button" className="catalog-filter-toggle catalog-filter-toggle-heading" onClick={() => setCatalogControlsOpen((current) => !current)} aria-expanded={catalogControlsOpen} aria-controls="catalog-controls"><FilterIcon /><span>{catalogControlsOpen ? 'Hide filters' : 'Show filters'}</span></button>
                  </div>
                </div>
                {catalogControlsOpen ? <div className="catalog-controls-wrap is-open"><form id="catalog-controls"
                onSubmit={(event) => {
                  event.preventDefault()
                  setQuery(searchInput)
                }}
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em]"><SearchIcon /><span>Search</span></span>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      className="workspace-input min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm outline-none transition"
                      placeholder="Title, author or category"
                    />
                    <button
                      type="submit"
                      className="pine-action rounded-2xl px-4 py-2 text-sm font-semibold transition"
                    >
                      Search
                    </button>
                    {query || searchInput ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput('')
                          setQuery('')
                        }}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em]"><SortIcon /><span>Sort by</span></span>
                  <select
                    value={catalogSort}
                    onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="title">Title A-Z</option>
                    <option value="author">Author A-Z</option>
                    <option value="newest">Recently added</option>
                  </select>
                </label>
                </form></div> : null}
              </div>

              {/* Category Pills Bar */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Category:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      selectedCategory === cat
                        ? 'bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900 shadow-sm'
                        : 'border border-paper-300 bg-paper-50 text-slate-600 hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800/50 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Format:</span>
                {([['all', 'All materials'], ['digital', 'Digital'], ['physical', 'Physical']] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setSelectedFormat(value)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${selectedFormat === value ? 'bg-pine-700 text-white shadow-sm dark:bg-paper-100 dark:text-forest-900' : 'border border-paper-300 bg-paper-50 text-slate-600 hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800/50 dark:text-slate-300'}`}>{label}</button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-900 dark:text-slate-100">{filteredBooks.length}</span> of {books.length} volumes
                </div>
              </div>

              <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book) => (
                    <div key={book.id} className={`resource-card rounded-[1.5rem] p-5 ${expandedBookId === book.id ? 'resource-card-expanded' : ''}`} role="button" tabIndex={0} aria-expanded={expandedBookId === book.id} onClick={(event) => { if ((event.target as HTMLElement).closest('button')) return; setExpandedBookId((current) => current === book.id ? null : book.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedBookId((current) => current === book.id ? null : book.id) } }}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><p className="text-celadon text-sm font-semibold uppercase tracking-[0.2em]">{book.category}</p><span className="rounded-full border border-paper-300 bg-paper-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-forest-700 dark:bg-forest-800 dark:text-slate-300">{book.catalog_type === 'physical' ? 'Physical' : book.catalog_type === 'hybrid' ? 'Digital + physical' : 'Digital'}</span></div>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">by {book.author}</p>
                        </div>
                      </div>
                      {expandedBookId === book.id ? <>
                      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">ISBN</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.isbn ?? 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Format</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.catalog_type === 'physical' ? 'Physical copy' : book.catalog_type === 'hybrid' ? 'Digital + physical' : 'Digital'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Access</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.access_mode === 'premium' ? 'Paid access temporarily unavailable' : book.access_mode === 'points' ? 'Automatic points access' : 'Automatic access'}</p>
                        </div>
                      </div>
                      {book.catalog_type !== 'digital' ? <div className="mt-4 rounded-xl border border-paper-300 bg-paper-50 p-3 text-sm dark:border-forest-700 dark:bg-forest-800/60"><div className="flex flex-wrap gap-x-4 gap-y-1"><span><strong>{book.physical_available_copies ?? 0}</strong> available</span><span><strong>{book.physical_borrowed_copies ?? 0}</strong> borrowed</span><span><strong>{book.physical_registered_copies ?? 0}</strong> total copies</span></div>{book.physical_locations?.length ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">Location: {book.physical_locations.join(', ')}</p> : <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">Location has not been assigned yet.</p>}</div> : null}

                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{book.catalog_type === 'physical' ? 'Library copy · availability shown in physical collection' : 'Online resource · no stock limit'}</span>
                        {book.pdf_url && book.catalog_type !== 'physical' ? (
                          <span className="rounded-md bg-pine-100 px-2 py-0.5 font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                            PDF Ready
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (book.catalog_type === 'physical') {
                            setPhysicalBook({
                              id: book.id,
                              title: book.title,
                              author: book.author,
                              category: book.category,
                              catalog_type: book.catalog_type === 'physical' ? 'physical' : 'hybrid',
                            })
                            return
                          }
                          setDurationDays(String(DIGITAL_ACCESS_DURATION_OPTIONS.includes(book.access_duration_days as typeof DIGITAL_ACCESS_DURATION_OPTIONS[number]) ? book.access_duration_days : 30))
                          setSelectedBook(book)
                          setRequestStatus(null)
                        }}
                        className="pine-action mt-5 inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={requestingBookId !== null}
                      >
                        {book.catalog_type === 'physical' ? 'Browse copies & request' : 'Request digital access'}
                      </button>
                      <div className="mt-3 flex gap-2">
                        {book.catalog_type === 'hybrid' ? <button type="button" onClick={() => setPhysicalBook({
                          id: book.id,
                          title: book.title,
                          author: book.author,
                          category: book.category,
                          catalog_type: book.catalog_type === 'physical' ? 'physical' : 'hybrid',
                        })} className="secondary-action flex-1 rounded-xl border px-3 py-2 text-xs font-semibold">Physical copies</button> : null}
                      </div>
                      </> : <p className="resource-card-hint">Select to view details and actions</p>}
                    </div>
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
                <span className="rounded-full bg-slate-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activeLoans.length} active</span>
              </div>

              <div className="mt-6 space-y-4">
                {activeLoans.length > 0 ? (
                  activeLoans.map((loan) => {
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
                            <button
                              type="button"
                              onClick={() => void handleReturnLoan(loan.id)}
                              disabled={loanActionId !== null}
                              className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Return
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
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
        copyId={physicalCopyId}
        onClose={() => { setPhysicalBook(null); setPhysicalCopyId(null) }}
        onComplete={() => { setPhysicalBook(null); setPhysicalCopyId(null); setDataReady(false); setDataReloadToken((value) => value + 1) }}
      />
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
                  className={`rounded-2xl border px-4 py-3 text-left transition ${durationDays === String(days) ? 'border-forest-900 bg-forest-900 text-paper-100 dark:border-paper-100 dark:bg-paper-100 dark:text-forest-900' : 'border-paper-300 bg-paper-50 text-slate-700 hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100'}`}
                >
                  <span className="block text-sm font-semibold">{days} {days === 1 ? 'day' : 'days'}</span>
                  <span className={`mt-1 block text-xs ${durationDays === String(days) ? 'text-paper-100/75 dark:text-forest-900/70' : 'text-slate-500 dark:text-slate-300'}`}>Configured access period</span>
                </button>
              ))}
            </div> : null}

            {selectedBook.access_mode === 'premium' ? <div className="mt-5 space-y-3 rounded-2xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/70"><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-slate-800 dark:text-slate-100">Premium price</span><span className="font-semibold text-pine-700 dark:text-pine-200">₱{Number(selectedBook.premium_price).toFixed(2)}</span></div><label className="block text-sm font-medium">Payment reference<input value={premiumReference} onChange={(event) => setPremiumReference(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><label className="block text-sm font-medium">Payment proof<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPremiumProofFile(event.target.files?.[0] ?? null)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><p className="text-xs leading-5 text-slate-500 dark:text-slate-300">Use the configured payment channel and upload a clear receipt image. A screenshot is evidence for review, not automatic confirmation.</p></div> : <div className="mt-5 rounded-2xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/70">
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
                {requestingBookId === selectedBook.id || premiumPurchaseSaving ? 'Submitting...' : selectedBook.access_mode === 'premium' ? `Submit payment · ₱${Number(selectedBook.premium_price).toFixed(2)}` : selectedBook.access_mode === 'points' ? `Unlock for ${getDigitalAccessCost(selectedBook.access_costs, Number(durationDays), selectedBook.access_points)} points` : 'Unlock free access'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {contributionOpen ? (
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
              <textarea value={contributionForm.description} onChange={(event) => setContributionForm({ ...contributionForm, description: event.target.value })} placeholder="Why is this useful for the library?" rows={3} className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <label className="block"><span className="text-sm font-medium">PDF file</span><input required type="file" accept="application/pdf,.pdf" onChange={(event) => setContributionFile(event.target.files?.[0] ?? null)} className="workspace-input mt-2 block w-full rounded-2xl border border-dashed px-4 py-3 text-sm" /><span className="mt-1 block text-xs text-slate-500">PDF only, maximum 50 MB.</span></label>
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
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Point your camera at a Smart Lib copy sticker. The matching book will open in the catalog.</p>
            <video ref={scannerVideoRef} className="mt-5 aspect-video w-full rounded-2xl bg-slate-950 object-cover" muted playsInline />
            {scannerError ? <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{scannerError}</p> : null}
          </section>
        </div>
      ) : null}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <WalletModal open={walletOpen} balance={profile?.points_balance ?? 0} onClose={() => setWalletOpen(false)} onOpenDetails={() => router.push('/points')} />
      <ActionModal
        open={confirmAction !== null}
        title={confirmAction?.type === 'renew' ? 'Renew e-book access?' : 'Return e-book?'}
        description={confirmAction?.type === 'return' ? 'You will lose access before the current expiry date.' : undefined}
        confirmLabel={confirmAction?.type === 'renew' ? 'Renew access' : 'Return e-book'}
        tone={confirmAction?.type === 'return' ? 'danger' : 'default'}
        busy={loanActionId !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction
          setConfirmAction(null)
          if (action?.type === 'renew') void executeRenewLoan(action.id)
          else if (action?.type === 'return') void executeReturnLoan(action.id)
        }}
      />
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
                  return <article key={loan.id} className="continue-reading-card rounded-2xl border border-paper-300 bg-paper-100/70 p-4 dark:border-forest-700 dark:bg-forest-800/60">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last opened page {page}{totalPages ? ` of ${totalPages}` : ''}</p></div><span className="rounded-full bg-pine-100 px-2 py-1 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">{percentage === null ? 'Active' : `${percentage}%`}</span></div>
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
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your active e-book access. It expires automatically on the due date; renew before then if you need more time.</p>
            <div className="active-access-list">
              {activeLoans.length > 0 ? activeLoans.map((loan) => {
                const dueDate = loan.due_date ? new Date(loan.due_date) : null
                const diffDays = dueDate ? Math.ceil((dueDate.getTime() - clock) / (1000 * 60 * 60 * 24)) : null
                const isUrgent = diffDays !== null && diffDays <= 3
                return <article key={loan.id} className="active-access-item"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Unlocked {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'} · Expires {dueDate ? dueDate.toLocaleDateString() : 'N/A'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isUrgent ? 'bg-amber-100 text-amber-900' : 'bg-pine-100 text-pine-700'}`}>{diffDays !== null ? `${diffDays} days left` : 'Active'}</span></div><div className="mt-3 flex flex-wrap gap-2">{loan.pdf_url ? <button type="button" onClick={() => { setActiveAccessOpen(false); router.push(`/reader/${loan.book_id}`) }} className="pine-action rounded-xl px-3 py-2 text-xs font-semibold">Read now</button> : null}<button type="button" onClick={() => void handleLoanAction(loan.id)} disabled={loanActionId !== null || (loan.renewal_count ?? 0) >= 2} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">{(loan.renewal_count ?? 0) >= 2 ? 'Renewal limit' : 'Renew'}</button><button type="button" onClick={() => void handleReturnLoan(loan.id)} disabled={loanActionId !== null} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">Return</button></div></article>
              }) : <div className="modal-empty-state">You do not have any active digital access yet. Explore the catalog to unlock a resource.</div>}
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
      {physicalReturnPickerOpen ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhysicalReturnPickerOpen(false) }}>
        <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="physical-return-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Physical lending</p><h2 id="physical-return-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Request a return</h2></div><button type="button" className="notification-modal-close" onClick={() => setPhysicalReturnPickerOpen(false)} aria-label="Close return request">×</button></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose the book you are bringing to the library desk. A librarian will inspect and complete the return.</p><div className="modal-record-list">{physicalLoans.filter((loan) => loan.status === 'checked_out').map((loan) => <div key={`physical-return-${loan.id}`} className="modal-record"><div><p className="font-semibold text-slate-900 dark:text-slate-100">{loan.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{loan.due_date ? `Due ${new Date(loan.due_date).toLocaleDateString()}` : 'Active loan'}{loan.receipt_number ? ` · Receipt ${loan.receipt_number}` : ''}</p></div><button type="button" disabled={physicalReturnActionId === loan.id} onClick={() => { void requestPhysicalReturn(loan.id); setPhysicalReturnPickerOpen(false) }} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">{physicalReturnActionId === loan.id ? 'Requesting...' : 'Request return'}</button></div>)}{physicalLoans.filter((loan) => loan.status === 'checked_out').length === 0 ? <div className="modal-empty-state">No active physical loans need a return request.</div> : null}</div></section>
      </div> : null}
      {physicalHistoryOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhysicalHistoryOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="physical-history-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Physical lending</p><h2 id="physical-history-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Physical requests and receipts</h2></div><button type="button" className="notification-modal-close" onClick={() => setPhysicalHistoryOpen(false)} aria-label="Close physical lending history">×</button></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track requests, queue positions, payment, checkout, returns, and receipts.</p><div className="modal-record-list">{physicalWaitlist.map((entry) => <div key={`physical-waitlist-${entry.book_id}`} className="modal-record"><div><p className="font-semibold text-slate-900 dark:text-slate-100">{entry.title ?? `Book #${entry.book_id}`}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Availability queue · joined {new Date(entry.created_at).toLocaleDateString()}</p></div><span className="status-pill rounded-full px-3 py-1 text-xs font-semibold status-pending">Waitlisted</span></div>)}{physicalLoans.map((loan) => <div key={`physical-history-${loan.id}`} className="modal-record"><div className="min-w-0"><p className="font-semibold text-slate-900 dark:text-slate-100">{loan.title}</p><p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">{loan.status === 'pending' ? 'Awaiting librarian review' : loan.status === 'return_pending' ? 'Return requested' : loan.status.replace('_', ' ')} · {loan.payment_status.replace('_', ' ')} · {loan.payment_method === 'gcash' ? 'GCash' : 'Cash'} · PHP {Number(loan.fee_amount).toFixed(2)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Requested {new Date(loan.requested_at).toLocaleDateString()}{loan.due_date ? ` · Due ${new Date(loan.due_date).toLocaleDateString()}` : ''}</p>{loan.receipt_number ? <p className="mt-2 font-mono text-xs font-semibold text-pine-700 dark:text-pine-200">Receipt: {loan.receipt_number}</p> : loan.status === 'pending' ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Bring this request to the librarian for payment confirmation and checkout.</p> : null}</div>{loan.receipt_number ? <button type="button" onClick={() => setPhysicalReceipt(loan)} className="secondary-action shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold">View receipt</button> : null}</div>)}{physicalLoans.length === 0 && physicalWaitlist.length === 0 ? <div className="modal-empty-state">No physical lending records yet.</div> : null}</div></section>
        </div>
      ) : null}
      {physicalReceipt ? <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhysicalReceipt(null) }}>
        <section className="notification-modal receipt-printable" role="dialog" aria-modal="true" aria-labelledby="physical-receipt-title"><div className="notification-modal-header"><div><p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Library receipt</p><h2 id="physical-receipt-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Physical-book receipt</h2></div><button type="button" className="notification-modal-close" onClick={() => setPhysicalReceipt(null)} aria-label="Close physical receipt">×</button></div><div className="mt-5 grid gap-3 rounded-2xl border border-paper-300 bg-paper-50 p-4 text-sm dark:border-forest-700 dark:bg-forest-900/60"><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Receipt number</span><strong className="font-mono text-pine-700 dark:text-pine-200">{physicalReceipt.receipt_number}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Book</span><strong className="text-right text-slate-900 dark:text-slate-100">{physicalReceipt.title}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Amount paid</span><strong>₱{Number(physicalReceipt.fee_amount).toFixed(2)}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Payment</span><span className="capitalize">{physicalReceipt.payment_method} · {physicalReceipt.payment_status.replace('_', ' ')}</span></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Checked out</span><span>{physicalReceipt.checked_out_at ? new Date(physicalReceipt.checked_out_at).toLocaleString() : 'Pending checkout'}</span></div><div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Return date</span><span>{physicalReceipt.due_date ? new Date(physicalReceipt.due_date).toLocaleDateString() : 'Not assigned'}</span></div>{physicalReceipt.transaction_reference ? <div className="flex items-start justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Transaction reference</span><span className="break-all text-right">{physicalReceipt.transaction_reference}</span></div> : null}</div><button type="button" onClick={() => window.print()} className="pine-action mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold">Print receipt</button></section>
      </div> : null}
      {physicalHistoryOpen ? <div className="sr-only" aria-live="polite">{physicalLoans.filter((loan) => loan.status === 'return_pending').length} return requests are waiting for librarian confirmation.</div> : null}
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
            {fines.length > 0 ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">Unpaid fines: <strong>${fines.reduce((total, fine) => total + Number(fine.amount), 0).toFixed(2)}</strong></div> : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
