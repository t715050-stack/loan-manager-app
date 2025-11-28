import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  DollarSign, 
  TrendingUp, 
  Users, 
  AlertCircle,
  History,
  Trash2,
  Edit3,
  AlertTriangle,
  FileText,
  Layout,
  PieChart,
  ArrowDownCircle
} from 'lucide-react';

// --- 核心輔助函式 ---

const formatCurrency = (amount) => {
  const safeAmount = amount || 0; 
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(safeAmount);
};

const createLocalDate = (dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    date.setHours(0, 0, 0, 0); 
    return date;
};

const getLocalDateString = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDaysDiff = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date1.getTime() - date2.getTime()) / oneDay);
};

const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
};

/**
 * 計算下一次繳款日期
 */
const calculateNextDueDate = (customer) => {
  const { frequencyType, frequencyValue, lastPaidDate, loanStartDate } = customer;
  
  let baseDate; 
  if (lastPaidDate) {
    baseDate = createLocalDate(lastPaidDate);
  } else {
    baseDate = createLocalDate(loanStartDate);
    if (baseDate) baseDate.setDate(baseDate.getDate() - 1);
    else baseDate = new Date(0);
  }
  
  baseDate.setHours(0, 0, 0, 0); 

  let nextDueDate = new Date(8640000000000000); 
  let found = false; 

  if (frequencyType === 'monthly_date') {
    let targetDays = [];
    if (Array.isArray(frequencyValue)) {
        targetDays = frequencyValue.map(d => parseInt(d)).sort((a, b) => a - b);
    } else {
        targetDays = [parseInt(frequencyValue)];
    }

    let currentYear = baseDate.getFullYear();
    let currentMonth = baseDate.getMonth(); 

    for (let i = 0; i < 12; i++) {
        const daysInMonth = getDaysInMonth(currentYear, currentMonth);
        for (let day of targetDays) {
            const actualDay = Math.min(day, daysInMonth); 
            const candidateDate = new Date(currentYear, currentMonth, actualDay);
            candidateDate.setHours(0, 0, 0, 0);

            if (candidateDate.getTime() > baseDate.getTime()) {
                if (candidateDate < nextDueDate) {
                    nextDueDate = candidateDate;
                    found = true;
                }
            }
        }
        if (found) break; 
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
    }
  }
  else if (frequencyType === 'weekly_day') {
    let val = Array.isArray(frequencyValue) ? frequencyValue[0] : frequencyValue;
    let targetDayOfWeek = parseInt(val);
    if (isNaN(targetDayOfWeek)) targetDayOfWeek = 5; 
    
    let searchDate = new Date(baseDate);
    searchDate.setDate(searchDate.getDate() + 1); 

    for (let i = 0; i < 7; i++) { 
        if (searchDate.getDay() === targetDayOfWeek) {
            nextDueDate = searchDate;
            found = true;
            break;
        }
        searchDate.setDate(searchDate.getDate() + 1);
    }
  } else if (frequencyType === 'interval_days') {
    let val = Array.isArray(frequencyValue) ? frequencyValue[0] : frequencyValue;
    const freqVal = parseInt(val) || 10; 
    
    let candidate = new Date(baseDate);
    candidate.setDate(candidate.getDate() + freqVal);
    nextDueDate = candidate;
    found = true;
  }

  if (!found || nextDueDate.getTime() > new Date(3000, 0, 1).getTime()) {
      return null; 
  }

  return nextDueDate;
};

const getFrequencyLabel = (c) => {
    if (c.frequencyType === 'monthly_date') {
            const days = Array.isArray(c.frequencyValue) ? c.frequencyValue : [c.frequencyValue];
            return `每月 ${days.sort((a,b)=>a-b).join(', ')} 號`;
    } else if (c.frequencyType === 'weekly_day') {
            const dayMap = ['日', '一', '二', '三', '四', '五', '六'];
            let val = Array.isArray(c.frequencyValue) ? c.frequencyValue[0] : c.frequencyValue;
            return `每週${dayMap[val] !== undefined ? dayMap[val] : '?'}`;
    } else {
            let val = Array.isArray(c.frequencyValue) ? c.frequencyValue[0] : c.frequencyValue;
            return `每隔 ${val} 天`;
    }
};

// --- UI 元件 ---

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button>
        </div>
        <div className="p-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

const PaymentModal = ({ isOpen, onClose, customer, nextDueDate, onConfirm }) => {
    const [updateCycle, setUpdateCycle] = useState(true);
    const [amount, setAmount] = useState(customer?.paymentAmount || 0);
    const [principalReduction, setPrincipalReduction] = useState(0); // 新增：本金償還金額
    const [payDate, setPayDate] = useState(getLocalDateString(new Date()));

    useEffect(() => {
        if (customer) {
            setAmount(customer.paymentAmount);
            setPrincipalReduction(0);
            setUpdateCycle(true); 
            setPayDate(getLocalDateString(new Date()));
        }
    }, [customer, isOpen]);

    if (!isOpen || !customer) return null;

    const handleConfirm = () => {
        onConfirm({
            amount: parseFloat(amount),
            principalReduction: parseFloat(principalReduction),
            updateCycle,
            paymentDate: payDate
        });
    };

    // 預估新的本金
    const estimatedRemaining = (customer.remainingPrincipal ?? customer.loanAmount) - (parseFloat(principalReduction) || 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="收款確認">
            <div className="space-y-5">
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600 text-sm">客戶</span>
                        <span className="font-bold text-lg text-gray-800">{customer.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">目前剩餘本金</span>
                        <span className="font-bold text-gray-800 text-lg">{formatCurrency(customer.remainingPrincipal ?? customer.loanAmount)}</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">本次實收總金額</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            className="pl-8 block w-full rounded-md border-gray-300 shadow-sm border p-3 text-xl font-bold text-green-600 focus:ring-indigo-500 focus:border-indigo-500" 
                        />
                    </div>
                </div>

                {/* 本金償還選項 */}
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <label className="block text-sm font-bold text-blue-800 mb-1 flex items-center gap-1">
                        <ArrowDownCircle size={16}/> 額外償還本金 (選填)
                    </label>
                    <p className="text-xs text-blue-600 mb-2">若客戶多繳錢要抵扣本金，請在此輸入金額。系統將自動扣除本金並重新計算。</p>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span>
                        <input 
                            type="number" 
                            value={principalReduction} 
                            onChange={(e) => setPrincipalReduction(e.target.value)} 
                            className="pl-8 block w-full rounded-md border-blue-300 shadow-sm border p-2 text-blue-700 font-bold"
                            placeholder="0"
                        />
                    </div>
                    {parseFloat(principalReduction) > 0 && (
                        <p className="text-xs text-red-500 mt-1 font-medium text-right">
                            預計剩餘本金: {formatCurrency(Math.max(0, estimatedRemaining))}
                        </p>
                    )}
                </div>

                <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">收款日期</label>
                     <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2"/>
                </div>

                <div className={`p-3 rounded-lg border cursor-pointer transition-colors ${updateCycle ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`} onClick={() => setUpdateCycle(!updateCycle)}>
                    <div className="flex items-start space-x-3">
                        <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${updateCycle ? 'bg-green-500 border-green-500' : 'bg-white border-gray-400'}`}>
                            {updateCycle && <CheckCircle size={14} className="text-white" />}
                        </div>
                        <div className="flex-1">
                            <span className={`font-bold block ${updateCycle ? 'text-green-800' : 'text-gray-700'}`}>
                                {updateCycle ? "正常繳款 (更新下次應繳日)" : "僅記帳 (不更新下次應繳日)"}
                            </span>
                        </div>
                    </div>
                </div>

                <button onClick={handleConfirm} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition duration-150 flex items-center justify-center gap-2">
                    <CheckCircle size={20}/> 確認收款並更新
                </button>
            </div>
        </Modal>
    );
};

const ConfirmationModal = ({ isOpen, onClose, title, message, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center text-red-600 mb-4">
                        <AlertTriangle className="w-8 h-8 mr-2" />
                        <h3 className="text-xl font-bold">{title}</h3>
                    </div>
                    <p className="text-gray-600 mb-6 leading-relaxed">{message}</p>
                    <div className="flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium">取消</button>
                        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-md">確認刪除</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CustomerForm = ({ onSubmit, initialData = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    loanAmount: '',
    loanStartDate: getLocalDateString(new Date()),
    interestRate: '',
    paymentAmount: '',
    paymentType: 'auto', 
    frequencyType: 'monthly_date', 
    frequencyValue: ['5'], 
    serviceFee: '0', 
    dailyPenaltyAmount: '0', 
    netReceivedAmount: '', 
    totalInstallments: '', 
  });

  useEffect(() => {
    if (initialData) {
        let fValue = initialData.frequencyValue;
        if (!Array.isArray(fValue)) {
            fValue = [fValue?.toString() || '5'];
        } else {
            fValue = fValue.map(v => v.toString());
        }

        setFormData({
            ...initialData,
            loanAmount: initialData.loanAmount?.toString() || '0',
            interestRate: initialData.interestRate?.toString() || '0',
            paymentAmount: initialData.paymentAmount?.toString() || '0',
            serviceFee: initialData.serviceFee?.toString() || '0',
            dailyPenaltyAmount: initialData.dailyPenaltyAmount?.toString() || '0',
            frequencyValue: fValue,
            netReceivedAmount: initialData.netReceivedAmount?.toString() || '',
            totalInstallments: initialData.totalInstallments?.toString() || '',
            frequencyType: initialData.frequencyType || 'monthly_date'
        });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      let newData = { ...prev, [name]: value };
      
      const loanAmt = parseFloat(newData.loanAmount || 0);
      const rate = parseFloat(newData.interestRate || 0);
      const totalInst = parseInt(newData.totalInstallments || 0);
      const paymentAmt = parseFloat(newData.paymentAmount || 0);

      if (newData.paymentType === 'fixed_installment') {
        if ((name === 'loanAmount' || name === 'totalInstallments' || name === 'paymentType') && loanAmt > 0 && totalInst > 0) {
          newData.paymentAmount = Math.round(loanAmt / totalInst).toString();
        }
      } else if (newData.paymentType === 'auto') {
          if ((name === 'loanAmount' || name === 'interestRate' || name === 'paymentType') && name !== 'paymentAmount') {
              if (loanAmt > 0 && rate > 0) {
                  newData.paymentAmount = Math.round(loanAmt * (rate / 100)).toString();
              }
          }
          else if (name === 'paymentAmount') {
              if (loanAmt > 0 && paymentAmt > 0) {
                  const calculatedRate = (paymentAmt / loanAmt) * 100;
                  newData.interestRate = parseFloat(calculatedRate.toFixed(2)).toString();
              }
          }
      } 
      
      if (name === 'paymentType' && value !== 'fixed_installment') {
          newData.netReceivedAmount = '';
          newData.totalInstallments = '';
      }

      return newData;
    });
  };

  const toggleDay = (day) => {
      const dayStr = day.toString();
      setFormData(prev => {
          let currentDays = [...prev.frequencyValue];
          if (currentDays.includes(dayStr)) {
              if (currentDays.length > 1) currentDays = currentDays.filter(d => d !== dayStr);
          } else {
              currentDays.push(dayStr);
          }
          return { ...prev, frequencyValue: currentDays };
      });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let finalFrequencyValue;
    if (formData.frequencyType === 'monthly_date') {
        finalFrequencyValue = formData.frequencyValue.map(v => parseInt(v));
    } else {
        finalFrequencyValue = parseInt(formData.frequencyValue[0] || 1);
    }

    onSubmit({
      ...formData,
      loanAmount: parseFloat(formData.loanAmount || 0),
      interestRate: parseFloat(formData.interestRate || 0),
      paymentAmount: parseFloat(formData.paymentAmount || 0),
      frequencyValue: finalFrequencyValue,
      serviceFee: parseFloat(formData.serviceFee || 0), 
      dailyPenaltyAmount: parseFloat(formData.dailyPenaltyAmount || 0),
      netReceivedAmount: parseFloat(formData.netReceivedAmount || 0),
      totalInstallments: parseInt(formData.totalInstallments || 0),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">客戶姓名</label>
        <input required type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">總借款金額 (本金)</label>
          <input required type="number" name="loanAmount" value={formData.loanAmount} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
        </div>
        <div>
           <label className="block text-sm font-medium text-gray-700">借款日期</label>
           <input required type="date" name="loanStartDate" value={formData.loanStartDate} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
        </div>
      </div>
      
      <div className="bg-gray-50 p-3 rounded border border-gray-200 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">計息方式</label>
            <select name="paymentType" value={formData.paymentType} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm">
                <option value="auto">自動 (雙向計算)</option>
                <option value="fixed">固定金額</option>
                <option value="fixed_installment">本金分期</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">每期應繳</label>
            <input required type="number" name="paymentAmount" value={formData.paymentAmount} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 font-bold text-indigo-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">利率 (%)</label>
            <input type="number" step="0.1" name="interestRate" value={formData.interestRate} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" disabled={formData.paymentType === 'fixed_installment'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">服務費 (一次性)</label>
            <input type="number" name="serviceFee" value={formData.serviceFee} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">每日罰金 (逾期)</label>
            <input type="number" name="dailyPenaltyAmount" value={formData.dailyPenaltyAmount} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-red-600" />
          </div>
          
          {formData.paymentType === 'fixed_installment' && (
            <>
                <div>
                    <label className="block text-sm font-medium text-gray-700">實拿金額</label>
                    <input type="number" name="netReceivedAmount" value={formData.netReceivedAmount} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">總期數</label>
                    <input required type="number" min="1" name="totalInstallments" value={formData.totalInstallments} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="例如: 3" />
                </div>
            </>
          )}
      </div>
      
      <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
        <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center"><Calendar size={16} className="mr-1"/> 繳款週期設定</h4>
        <div className="space-y-4">
            <div>
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer mb-2">
                    <input type="radio" name="frequencyType" value="monthly_date" checked={formData.frequencyType === 'monthly_date'} onChange={handleChange} className="text-blue-600"/>
                    <span className="font-bold">每月固定日期 (可多選)</span>
                </label>
                {formData.frequencyType === 'monthly_date' && (
                    <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs text-gray-500 mb-2">已選繳款日: <span className="text-blue-600 font-bold">{formData.frequencyValue.sort((a,b)=>a-b).join(', ')}</span> 號</p>
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                                <button key={day} type="button" onClick={() => toggleDay(day)} className={`text-xs py-1.5 rounded border ${formData.frequencyValue.includes(day.toString()) ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>{day}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex gap-4">
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="frequencyType" value="interval_days" checked={formData.frequencyType === 'interval_days'} onChange={handleChange} className="text-blue-600"/>
                    <span>固定間隔天數</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="frequencyType" value="weekly_day" checked={formData.frequencyType === 'weekly_day'} onChange={handleChange} className="text-blue-600"/>
                    <span>每週固定</span>
                </label>
            </div>
            
            {formData.frequencyType === 'interval_days' && (
                 <div className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200"><span className="text-sm">每隔</span><input type="number" value={formData.frequencyValue[0]} onChange={(e)=>setFormData(p=>({...p, frequencyValue:[e.target.value]}))} className="w-16 border rounded p-1 text-center"/><span className="text-sm">天</span></div>
            )}
            
            {formData.frequencyType === 'weekly_day' && (
               <div className="ml-6 mt-2 bg-white p-2 rounded border border-blue-200">
                    <select value={formData.frequencyValue[0]} onChange={(e) => setFormData(p => ({...p, frequencyValue: [e.target.value]}))} className="border p-1 rounded w-full">
                        <option value="1">禮拜一</option>
                        <option value="2">禮拜二</option>
                        <option value="3">禮拜三</option>
                        <option value="4">禮拜四</option>
                        <option value="5">禮拜五</option>
                        <option value="6">禮拜六</option>
                        <option value="0">禮拜日</option>
                    </select>
                </div>
            )}
        </div>
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200 font-bold shadow-md">{initialData ? '儲存修改' : '新增合約'}</button>
    </form>
  );
};

// --- 主程式 ---
export default function App() {
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  const [view, setView] = useState('customers'); 
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [paymentModalData, setPaymentModalData] = useState({ isOpen: false, customer: null });
  const [confirmationState, setConfirmationState] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [reportView, setReportView] = useState('overview');
  const [selectedReportCustomer, setSelectedReportCustomer] = useState(null);
  const [selectedReportLoanId, setSelectedReportLoanId] = useState(null);

  useEffect(() => {
    const savedCustomers = localStorage.getItem('loan_app_customers_v2');
    const savedTransactions = localStorage.getItem('loan_app_transactions_v2');
    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
  }, []);

  useEffect(() => {
    localStorage.setItem('loan_app_customers_v2', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('loan_app_transactions_v2', JSON.stringify(transactions));
  }, [transactions]);

  const enrichedCustomers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return customers.map(c => {
        let nextDueDate = calculateNextDueDate(c);
        
        let daysOverdue = 0;
        let isOverdue = false;
        let currentPenalty = 0;
        
        const myTransactions = transactions.filter(t => t.customerId === c.id);
        const totalPaid = myTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        // 初始化剩餘本金 (若舊資料沒有此欄位，則預設為總本金)
        const currentBalance = c.remainingPrincipal !== undefined ? c.remainingPrincipal : (c.loanAmount || 0);

        // 自動結清判斷：如果剩餘本金 <= 0，視為結清
        let isFullyPaid = false;
        if (currentBalance <= 0) {
            isFullyPaid = true;
            nextDueDate = null;
        } else if (c.paymentType === 'fixed_installment' && totalPaid >= (c.loanAmount || 0)) {
            // 向下相容：本金分期如果總還款 >= 本金也算結清
            isFullyPaid = true;
            nextDueDate = null;
        }

        if (!isFullyPaid && nextDueDate && !isNaN(nextDueDate.getTime()) && nextDueDate < today) {
            isOverdue = true;
            daysOverdue = getDaysDiff(today, nextDueDate);
            currentPenalty = daysOverdue * (c.dailyPenaltyAmount || 0);
        }

        let actualDisbursed = c.loanAmount;
        if (c.paymentType === 'fixed_installment' && c.netReceivedAmount) {
            actualDisbursed = c.netReceivedAmount;
        } else {
            actualDisbursed = c.loanAmount - (c.serviceFee || 0);
        }

        return {
            ...c,
            nextDueDate,
            isOverdue,
            daysOverdue,
            currentPenalty,
            actualDisbursed,
            totalPaid,
            isFullyPaid,
            currentBalance // 輸出目前剩餘本金
        };
    }).sort((a, b) => {
        if (!a.nextDueDate) return 1;
        if (!b.nextDueDate) return -1;
        return a.nextDueDate.getTime() - b.nextDueDate.getTime();
    });
  }, [customers, transactions]);

  const stats = useMemo(() => {
    const totalLoaned = customers.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
    const totalCollected = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const overdueCount = enrichedCustomers.filter(c => c.isOverdue).length;
    const totalPenalty = enrichedCustomers.reduce((sum, c) => sum + c.currentPenalty, 0);
    return { totalLoaned, totalCollected, overdueCount, totalPenalty };
  }, [customers, transactions, enrichedCustomers]);

  const reportGroups = useMemo(() => {
      const groups = {};
      enrichedCustomers.forEach(c => {
          if (!groups[c.name]) {
              groups[c.name] = { name: c.name, loans: [], totalLoaned: 0, totalPaid: 0 };
          }
          groups[c.name].loans.push(c);
          groups[c.name].totalLoaned += (c.loanAmount || 0);
          groups[c.name].totalPaid += c.totalPaid;
      });
      return Object.values(groups);
  }, [enrichedCustomers]);

  const handleAddCustomer = (data) => {
    const newCustomer = { 
        ...data, 
        id: Date.now().toString(), 
        lastPaidDate: null, 
        createdAt: new Date().toISOString(),
        remainingPrincipal: data.loanAmount // 新增：初始剩餘本金 = 借款金額
    };
    setCustomers(prev => [...prev, newCustomer]);
    setIsAddModalOpen(false);
  };

  const handleUpdateCustomer = (data) => {
    setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, ...data } : c));
    setEditingCustomer(null);
    setIsAddModalOpen(false);
  };

  const handleDeleteCustomer = (id) => {
      setConfirmationState({
          isOpen: true, 
          title: "刪除合約", 
          message: "確定刪除此合約嗎？這將無法復原。", 
          onConfirm: () => {
              setCustomers(prev => prev.filter(c => c.id !== id));
              setConfirmationState({ isOpen: false });
          }
      });
  };

  const initiatePayment = (customer) => setPaymentModalData({ isOpen: true, customer });

  const handleConfirmPayment = ({ amount, principalReduction, updateCycle, paymentDate }) => {
      const customer = paymentModalData.customer;
      const enriched = enrichedCustomers.find(c => c.id === customer.id);
      
      const newTransaction = {
          id: Date.now().toString(),
          customerId: customer.id,
          customerName: customer.name,
          amount: amount, // 實收總額
          principalPaid: principalReduction, // 紀錄本金償還
          date: paymentDate, 
          type: 'payment',
          note: updateCycle ? (principalReduction > 0 ? `正常繳款 + 還本$${principalReduction}` : '正常繳款') : '部分/額外還款',
          cycleDateSnapshot: enriched.nextDueDate ? getLocalDateString(enriched.nextDueDate) : null
      };
      setTransactions(prev => [newTransaction, ...prev]);

      setCustomers(prev => prev.map(c => {
          if (c.id === customer.id) {
              let updates = {};
              // 1. 更新上次繳款日 (如果勾選更新)
              if (updateCycle && enriched.nextDueDate) {
                  updates.lastPaidDate = getLocalDateString(enriched.nextDueDate);
              }
              
              // 2. 更新剩餘本金 (如果有的話)
              // 確保有初始值
              const currentPrincipal = c.remainingPrincipal !== undefined ? c.remainingPrincipal : c.loanAmount;
              if (principalReduction > 0) {
                  const newPrincipal = Math.max(0, currentPrincipal - principalReduction);
                  updates.remainingPrincipal = newPrincipal;

                  // 3. 自動重新計算應繳金額 (針對自動計息模式)
                  if (c.paymentType === 'auto' && c.interestRate > 0) {
                      updates.paymentAmount = Math.round(newPrincipal * (c.interestRate / 100)).toString();
                  }
              }
              return { ...c, ...updates };
          }
          return c;
      }));

      setPaymentModalData({ isOpen: false, customer: null });
  };

  const handleDeleteTransaction = (tid) => {
      setConfirmationState({
          isOpen: true,
          title: "刪除交易",
          message: "刪除交易不會自動回補已扣除的本金，請至編輯頁面手動修正「剩餘本金」或「上次繳款日」。",
          onConfirm: () => {
              setTransactions(prev => prev.filter(t => t.id !== tid));
              setConfirmationState({ isOpen: false });
          }
      });
  };

  // ... (renderDashboard, renderReports 保持不變)
  const renderDashboard = () => (
      <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100">
                  <p className="text-xs text-gray-500 mb-1">總借出金額</p>
                  <p className="text-2xl font-bold text-gray-800">{formatCurrency(stats.totalLoaned)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-green-100">
                  <p className="text-xs text-gray-500 mb-1">已回收金額</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalCollected)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100">
                  <p className="text-xs text-gray-500 mb-1">目前逾期數</p>
                  <p className="text-2xl font-bold text-red-600">{stats.overdueCount} <span className="text-sm font-normal text-gray-400">筆</span></p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                  <p className="text-xs text-gray-500 mb-1">累積罰金</p>
                  <p className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalPenalty)}</p>
              </div>
          </div>

          <div>
              <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><History size={18}/> 最近流水帳 (前 5 筆)</h3>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {transactions.length === 0 ? <div className="p-6 text-center text-gray-400">尚無交易</div> : 
                    transactions.slice(0, 5).map(t => (
                      <div key={t.id} className="p-4 border-b last:border-0 flex justify-between items-center">
                          <div>
                              <p className="font-bold text-gray-800">{t.customerName}</p>
                              <p className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString()} - {t.note}</p>
                          </div>
                          <span className="font-bold text-green-600">+{formatCurrency(t.amount)}</span>
                      </div>
                  ))}
              </div>
          </div>
      </div>
  );

  const renderCustomers = () => (
      <div className="space-y-4 animate-fade-in">
          {enrichedCustomers.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed">
                  <Users size={48} className="mx-auto mb-2 opacity-20"/>
                  <p>尚未建立任何借款合約</p>
                  <button onClick={() => { setEditingCustomer(null); setIsAddModalOpen(true); }} className="mt-4 text-indigo-600 font-bold">立即新增</button>
              </div>
          ) : (
              enrichedCustomers.map(c => (
                  <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                      <div className="p-4 border-b border-gray-50 flex justify-between items-start">
                          <div>
                              <div className="flex items-center gap-2">
                                  <h3 className="text-xl font-bold text-gray-800">{c.name}</h3>
                                  {c.isFullyPaid ? (
                                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle size={10}/> 已結清</span>
                                  ) : c.isOverdue ? (
                                      <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={10}/> 逾期 {c.daysOverdue} 天</span>
                                  ) : (
                                      <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full font-bold">進行中</span>
                                  )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">借款日: {new Date(c.loanStartDate).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-sm text-gray-500">本期應繳</p>
                              <p className={`text-2xl font-bold ${c.isFullyPaid ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>{formatCurrency(c.paymentAmount)}</p>
                          </div>
                      </div>
                      
                      <div className="bg-gray-50 px-4 py-3 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                          <div className="flex justify-between"><span className="text-gray-500">借款本金</span> <span className="font-medium">{formatCurrency(c.loanAmount)}</span></div>
                          <div className="flex justify-between">
                              <span className="text-gray-500">剩餘本金</span> 
                              <span className={`font-bold ${c.currentBalance < c.loanAmount ? 'text-green-600' : 'text-gray-800'}`}>{formatCurrency(c.currentBalance)}</span>
                          </div>
                          
                          {/* 如果是本金分期，顯示進度條 */}
                          {c.paymentType === 'fixed_installment' && (
                              <div className="col-span-2 mt-1 mb-1">
                                  <div className="flex justify-between text-xs mb-1">
                                      <span className="text-gray-500">還款進度</span>
                                      <span className="font-bold text-indigo-600">{formatCurrency(c.totalPaid)} / {formatCurrency(c.loanAmount)}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                                      <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, (c.totalPaid / c.loanAmount) * 100)}%` }}></div>
                                  </div>
                              </div>
                          )}

                          {c.currentPenalty > 0 && !c.isFullyPaid && (
                              <div className="col-span-2 flex justify-between bg-red-50 px-2 py-1 rounded border border-red-100">
                                  <span className="text-red-600 font-bold">目前累積罰金</span>
                                  <span className="text-red-600 font-bold">{formatCurrency(c.currentPenalty)}</span>
                              </div>
                          )}
                      </div>

                      <div className="p-4 flex justify-between items-end">
                          <div>
                              <p className="text-xs text-gray-500">下次應繳日</p>
                              <p className={`text-lg font-bold ${c.nextDueDate ? 'text-gray-800' : 'text-green-600'}`}>
                                  {c.nextDueDate ? c.nextDueDate.toLocaleDateString() : (c.isFullyPaid ? '已結清' : '未定')}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                  頻率: {getFrequencyLabel(c)}
                              </p>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={() => { setEditingCustomer(c); setIsAddModalOpen(true); }} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><Edit3 size={20}/></button>
                              <button onClick={() => handleDeleteCustomer(c.id)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={20}/></button>
                              {!c.isFullyPaid && (
                                  <button onClick={() => initiatePayment(c)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 flex items-center gap-1 font-bold"><CheckCircle size={18}/> 收款</button>
                              )}
                          </div>
                      </div>
                  </div>
              ))
          )}
      </div>
  );

  const renderReports = () => (
      <div className="animate-fade-in space-y-4">
          {reportView === 'overview' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                  <div className="p-4 border-b bg-gray-50"><h3 className="font-bold text-gray-700">客戶帳務報表</h3></div>
                  <div className="divide-y divide-gray-100">
                      {reportGroups.map(g => (
                          <div key={g.name} onClick={() => { setSelectedReportCustomer(g.name); setReportView('loanList'); }} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50">
                              <div>
                                  <p className="font-bold text-gray-800 text-lg">{g.name}</p>
                                  <p className="text-xs text-gray-500">共 {g.loans.length} 筆借款</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-sm text-gray-500">總借出 / 已還</p>
                                  <p className="font-medium"><span className="text-blue-600">{formatCurrency(g.totalLoaned)}</span> / <span className="text-green-600">{formatCurrency(g.totalPaid)}</span></p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {reportView === 'loanList' && (
              <div className="space-y-4">
                  <button onClick={() => setReportView('overview')} className="text-indigo-600 text-sm flex items-center gap-1 font-bold">← 返回總表</button>
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                      <div className="p-4 border-b bg-gray-50"><h3 className="font-bold text-gray-700">{selectedReportCustomer} 的借款清單</h3></div>
                      <div className="divide-y divide-gray-100">
                          {enrichedCustomers.filter(c => c.name === selectedReportCustomer).map(loan => (
                              <div key={loan.id} onClick={() => { setSelectedReportLoanId(loan.id); setReportView('loanDetail'); }} className="p-4 cursor-pointer hover:bg-gray-50">
                                  <div className="flex justify-between">
                                      <span className="font-bold text-gray-800">{formatCurrency(loan.loanAmount)}</span>
                                      <span className="text-xs text-gray-500">{new Date(loan.loanStartDate).toLocaleDateString()} 借</span>
                                  </div>
                                  <div className="flex justify-between mt-1">
                                      <span className="text-sm text-gray-600">應繳: {formatCurrency(loan.paymentAmount)}</span>
                                      <span className={`text-sm ${loan.nextDueDate ? 'text-indigo-600' : 'text-green-600'}`}>
                                          {loan.nextDueDate ? `下次: ${loan.nextDueDate.toLocaleDateString()}` : (loan.isFullyPaid ? '已結清' : '未定')}
                                      </span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

          {reportView === 'loanDetail' && (
              <div className="space-y-4">
                  <button onClick={() => setReportView('loanList')} className="text-indigo-600 text-sm flex items-center gap-1 font-bold">← 返回清單</button>
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                      <div className="p-4 border-b bg-gray-50"><h3 className="font-bold text-gray-700">詳細交易紀錄</h3></div>
                      <div className="divide-y divide-gray-100">
                          {transactions.filter(t => t.customerId === selectedReportLoanId).length === 0 ? <div className="p-6 text-center text-gray-400">無交易紀錄</div> :
                            transactions.filter(t => t.customerId === selectedReportLoanId)
                            .sort((a,b) => new Date(b.date) - new Date(a.date))
                            .map(t => (
                              <div key={t.id} className="p-4 flex justify-between items-center">
                                  <div>
                                      <p className="font-bold text-gray-800">收款 {formatCurrency(t.amount)}</p>
                                      <p className="text-xs text-gray-500">{new Date(t.date).toLocaleString()}</p>
                                      <p className="text-xs text-indigo-400">{t.note}</p>
                                  </div>
                                  <button onClick={() => handleDeleteTransaction(t.id)} className="text-red-400 p-2"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-24 md:pb-0">
      <header className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-lg font-bold flex items-center gap-2"><DollarSign className="text-yellow-400" size={24} /> 貸款管家 <span className="text-xs bg-yellow-500 text-black px-2 rounded ml-1">終極版</span></h1>
          <button onClick={() => { setEditingCustomer(null); setIsAddModalOpen(true); }} className="bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow hover:bg-indigo-600 flex items-center gap-1"><Plus size={18} /> 新增</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
          {view === 'dashboard' && renderDashboard()}
          {view === 'customers' && renderCustomers()}
          {view === 'reports' && renderReports()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-6 z-20 shadow-lg text-xs font-medium text-gray-500">
        <button onClick={() => setView('dashboard')} className={`flex flex-col items-center p-2 flex-1 ${view === 'dashboard' ? 'text-indigo-600' : ''}`}>
            <Layout size={24} className="mb-1"/> 總覽
        </button>
        <button onClick={() => setView('customers')} className={`flex flex-col items-center p-2 flex-1 ${view === 'customers' ? 'text-indigo-600' : ''}`}>
            <Users size={24} className="mb-1"/> 合約
        </button>
        <button onClick={() => setView('reports')} className={`flex flex-col items-center p-2 flex-1 ${view === 'reports' ? 'text-indigo-600' : ''}`}>
            <FileText size={24} className="mb-1"/> 報表
        </button>
      </nav>

      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setEditingCustomer(null); }} title={editingCustomer ? '編輯合約' : '新增合約'}>
        <CustomerForm onSubmit={editingCustomer ? handleUpdateCustomer : handleAddCustomer} initialData={editingCustomer} />
      </Modal>

      <PaymentModal isOpen={paymentModalData.isOpen} onClose={() => setPaymentModalData({ isOpen: false, customer: null })} customer={paymentModalData.customer} nextDueDate={paymentModalData.customer ? enrichedCustomers.find(c => c.id === paymentModalData.customer.id)?.nextDueDate : null} onConfirm={handleConfirmPayment} />

      <ConfirmationModal isOpen={confirmationState.isOpen} onClose={() => setConfirmationState({isOpen:false})} title={confirmationState.title} message={confirmationState.message} onConfirm={confirmationState.onConfirm} />
    </div>
  );
}
 