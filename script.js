/**
 * ==========================================================================
 * 바이브 카페 주문서 & 주문 내역 스크립트 (script.js)
 * ==========================================================================
 * 
 * [주요 기능]
 * 1. Supabase 연동 (orders 테이블에 주문 데이터 저장)
 * 2. 탭 전환 기능 (☕ 주문하기 / 📋 주문 내역)
 * 3. 실시간 예상 금액 계산 (calculateTotal 함수)
 * 4. 주문 유효성 검사 및 주문 접수 처리 (중복 클릭 방지)
 * 5. 주문 내역 배열(orders) 저장 및 관리 (최신순 정렬)
 * 6. 주문 내역 목록 렌더링 (renderOrders 함수 - 보안을 위해 textContent 사용)
 * 7. 개별 주문 취소 및 전체 내역 삭제 기능
 * 8. 다시 작성(초기화) 버튼 처리
 */

// ==========================================================================
// 0. Supabase 설정 (URL과 KEY는 사용자가 직접 입력)
// ==========================================================================
const SUPABASE_URL = 'https://qokvapdbnrdltunaopiv.supabase.co';       // 여기에 본인의 Supabase Project URL을 입력하세요
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFva3ZhcGRibnJkbHR1bmFvcGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzc4MDMsImV4cCI6MjEwNjgxMzgwM30.ZKo7u0iICsPiyA9v4KU44hovKNTRriVFiXx_m5hWjjo';  // 여기에 본인의 Supabase anon public API 키를 입력하세요

// Supabase 클라이언트 변수 (이름: supabaseClient)
// CDN을 통해 window.supabase 객체가 로드되어 있어야 정상 작동합니다.
const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : (window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);


// --------------------------------------------------------------------------
// 1. DOM 요소 가져오기
// --------------------------------------------------------------------------
// 탭 관련 요소
const tabBtnOrder = document.getElementById('tabBtnOrder');               // '주문하기' 탭 버튼
const tabBtnHistory = document.getElementById('tabBtnHistory');           // '주문 내역' 탭 버튼
const tabOrderSection = document.getElementById('tabOrderSection');       // '주문하기' 탭 콘텐츠 영역
const tabHistorySection = document.getElementById('tabHistorySection');   // '주문 내역' 탭 콘텐츠 영역
const orderCountBadge = document.getElementById('orderCountBadge');       // 탭 옆 주문 건수 배지

// 주문서 폼 관련 요소
const orderForm = document.getElementById('orderForm');                   // 주문 폼 전체
const userNameInput = document.getElementById('userName');               // 주문자 이름
const phoneInput = document.getElementById('phone');                     // 전화번호
const beverageSelect = document.getElementById('beverage');             // 음료 선택 드롭다운
const quantityInput = document.getElementById('quantity');               // 수량
const requestsInput = document.getElementById('requests');               // 요청사항
const totalPriceSpan = document.getElementById('totalPrice');           // 예상 금액 숫자
const submitBtn = document.getElementById('submitBtn');                   // 주문하기 버튼
const orderConfirmation = document.getElementById('orderConfirmation');   // 주문 확인 메시지 박스

// 주문 내역 목록 관련 요소
const orderList = document.getElementById('orderList');                   // 주문 내역 카드 목록 컨테이너
const orderSummaryArea = document.getElementById('orderSummaryArea');     // 하단 총 금액/삭제 영역
const totalOrdersSummary = document.getElementById('totalOrdersSummary'); // 총 주문 금액 및 건수 문구
const clearAllBtn = document.getElementById('clearAllBtn');               // 내역 모두 지우기 버튼


// --------------------------------------------------------------------------
// 2. 상태(State) 데이터 관리
// --------------------------------------------------------------------------
let orders = [];            // 주문 객체들을 저장할 배열
let nextOrderNumber = 1;    // 1부터 순차적으로 증가하는 주문 번호


// --------------------------------------------------------------------------
// 3. 탭 메뉴 전환 기능
// --------------------------------------------------------------------------
// '주문하기' 탭 클릭 시
tabBtnOrder.addEventListener('click', () => {
  tabBtnOrder.classList.add('active');
  tabBtnHistory.classList.remove('active');
  tabOrderSection.classList.remove('hidden');
  tabHistorySection.classList.add('hidden');
});

// '주문 내역' 탭 클릭 시
tabBtnHistory.addEventListener('click', () => {
  tabBtnHistory.classList.add('active');
  tabBtnOrder.classList.remove('active');
  tabHistorySection.classList.remove('hidden');
  tabOrderSection.classList.add('hidden');
  // 탭 전환 시 주문 내역 화면을 최신 상태로 렌더링
  renderOrders();
});


// --------------------------------------------------------------------------
// 4. 예상 금액 계산 함수 (calculateTotal)
// --------------------------------------------------------------------------
/**
 * 선택된 음료, 사이즈, 옵션, 수량을 바탕으로 총 금액을 계산하여 화면에 표시합니다.
 * @returns {number} 최종 계산된 총 금액
 */
function calculateTotal() {
  // 음료를 선택하지 않았다면 총 금액은 항상 0원
  if (!beverageSelect.value) {
    totalPriceSpan.textContent = '0';
    return 0;
  }

  // 1) 음료 기본 가격 (data-price 속성)
  const selectedDrinkOption = beverageSelect.options[beverageSelect.selectedIndex];
  const drinkPrice = parseInt(selectedDrinkOption.dataset.price, 10) || 0;

  // 2) 사이즈 추가금 (체크된 라디오의 data-price 속성)
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizePrice = selectedSizeRadio ? (parseInt(selectedSizeRadio.dataset.price, 10) || 0) : 0;

  // 3) 추가 옵션 금액 합산 (체크된 체크박스들의 data-price 속성 합계)
  let optionsPrice = 0;
  const checkedBoxes = document.querySelectorAll('input[name="option"]:checked');
  checkedBoxes.forEach((checkbox) => {
    optionsPrice += parseInt(checkbox.dataset.price, 10) || 0;
  });

  // 4) 수량 (1 ~ 10 사이)
  let qty = parseInt(quantityInput.value, 10);
  if (isNaN(qty) || qty < 1) {
    qty = 1;
  } else if (qty > 10) {
    qty = 10;
  }

  // 5) 최종 금액: (음료 + 사이즈 + 옵션들) * 수량
  const total = (drinkPrice + sizePrice + optionsPrice) * qty;

  // 6) 천 단위 콤마(toLocaleString) 적용 후 화면 반영
  totalPriceSpan.textContent = total.toLocaleString();

  return total;
}

// 폼 입력값 변경 시 실시간으로 계산 실행
orderForm.addEventListener('change', calculateTotal);
orderForm.addEventListener('input', calculateTotal);


// --------------------------------------------------------------------------
// 5. 주문하기 버튼 클릭(폼 제출) 시 주문 처리
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// 5. 주문하기 버튼 클릭(폼 제출) 시 주문 처리 (Supabase 저장 연동)
// --------------------------------------------------------------------------
orderForm.addEventListener('submit', async function (event) {
  event.preventDefault(); // 기본 폼 제출 동작(새로고침) 방지

  const userName = userNameInput.value.trim();

  // [검사 1] 이름 필수 입력 확인
  if (!userName) {
    alert('이름을 입력해주세요');
    userNameInput.focus();
    return;
  }

  // [검사 2] 음료 선택 확인
  if (!beverageSelect.value) {
    alert('음료를 선택해주세요');
    beverageSelect.focus();
    return;
  }

  // 총 금액 계산
  const finalTotal = calculateTotal();

  // 선택된 음료 정보 추출 (이름 및 단가)
  const selectedDrinkOption = beverageSelect.options[beverageSelect.selectedIndex];
  const drinkName = selectedDrinkOption.text.replace(/\s*[0-9,]+원$/, '').trim();
  const drinkPrice = parseInt(selectedDrinkOption.dataset.price, 10) || 0;

  // 선택된 사이즈 추출 (S, M, L)
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizeName = selectedSizeRadio ? selectedSizeRadio.value : 'M';

  // 체크된 추가 옵션 이름들 추출 (배열 형태)
  const checkedOptionNames = [];
  const checkedBoxes = document.querySelectorAll('input[name="option"]:checked');
  checkedBoxes.forEach((checkbox) => {
    const label = document.querySelector(`label[for="${checkbox.id}"]`);
    if (label) {
      const cleanName = label.textContent.replace(/\s*\(\+?[0-9,]+원\)/, '').trim();
      checkedOptionNames.push(cleanName);
    }
  });

  const optionText = checkedOptionNames.length > 0 ? ` (${checkedOptionNames.join(', ')})` : '';
  const qty = parseInt(quantityInput.value, 10) || 1;
  const requests = requestsInput ? requestsInput.value.trim() : '';

  // 현재 주문 접수 시간 (예: "오후 1:15")
  const now = new Date();
  const orderTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  // [중복 클릭 방지] 저장하는 동안 버튼 비활성화
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '주문 저장 중...';

  try {
    // Supabase 클라이언트 유효성 검사
    if (!supabaseClient) {
      throw new Error('Supabase 라이브러리가 로드되지 않았거나 설정이 올바르지 않습니다.');
    }

    // Supabase의 orders 테이블에 새로운 주문 데이터 저장
    const { data, error } = await supabaseClient
      .from('orders')
      .insert([
        {
          customer_name: userName,                 // 주문자 이름
          phone: phoneInput ? phoneInput.value.trim() : '', // 전화번호
          drink: drinkName,                        // 음료명
          drink_price: drinkPrice,                 // 음료 기본 단가
          size: sizeName,                          // 사이즈
          options: checkedOptionNames,             // 추가 옵션 목록 (문자열 배열)
          quantity: qty,                           // 수량
          request: requests,                       // 요청사항 (열 이름: request)
          total_price: finalTotal                  // 최종 결제 금액
        }
      ]);

    // Supabase 저장 중 오류가 발생한 경우 예외 처리
    if (error) {
      throw error;
    }

    // 1) 저장 성공: 기존 주문 확인 메시지 표시
    const resultMessage = `${userName}님, ${drinkName} ${sizeName}사이즈${optionText} ${qty}잔, 총 ${finalTotal.toLocaleString()}원 주문이 접수되었습니다!`;
    orderConfirmation.textContent = resultMessage;
    orderConfirmation.hidden = false;

    // 2) 로컬 주문 내역에도 추가하여 '주문 내역' 탭에 즉시 반영
    const newOrder = {
      orderNumber: nextOrderNumber++,
      name: userName,
      drink: drinkName,
      size: sizeName,
      options: checkedOptionNames,
      quantity: qty,
      requests: requests,
      totalPrice: finalTotal,
      orderTime: orderTime
    };
    orders.unshift(newOrder); // 최신 주문이 위로 오도록 배열 앞에 추가
    orderCountBadge.textContent = orders.length; // 탭 배지 숫자 갱신
    renderOrders(); // 주문 내역 화면 다시 그리기

  } catch (err) {
    // 저장 실패 시 알림창 및 브라우저 콘솔에 상세 에러 출력
    alert('주문 저장에 실패했어요');
    console.error('Supabase 주문 저장 에러:', err);
  } finally {
    // 저장이 완료(성공 또는 실패)되면 버튼을 다시 활성화
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});


// --------------------------------------------------------------------------
// 6. 주문 내역 목록 화면 렌더링 함수 (renderOrders)
// --------------------------------------------------------------------------
/**
 * orders 배열을 바탕으로 주문 내역 카드 목록과 하단 요약 정보를 렌더링합니다.
 * 보안(XSS 방지)을 위해 사용자가 입력한 모든 텍스트는 textContent로 삽입합니다.
 */
function renderOrders() {
  // 기존 목록 비우기
  orderList.textContent = '';

  // 주문 내역이 0건일 때 안내 문구 표시
  if (orders.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'empty-orders';
    emptyNotice.textContent = '아직 주문 내역이 없어요 ☕';
    orderList.appendChild(emptyNotice);

    // 하단 요약 및 전체 삭제 영역 숨기기
    orderSummaryArea.classList.add('hidden');
    return;
  }

  // 주문 내역이 있을 때는 하단 요약 영역 노출
  orderSummaryArea.classList.remove('hidden');

  // 총 누적 주문 금액 계산
  const totalAmount = orders.reduce((sum, order) => sum + order.totalPrice, 0);
  totalOrdersSummary.textContent = `총 주문 금액: ${totalAmount.toLocaleString()}원 (${orders.length}건)`;

  // 각 주문별 카드 요소 동적 생성
  orders.forEach((order) => {
    // 1건을 담는 베이지 카드 컨테이너
    const card = document.createElement('div');
    card.className = 'order-card';

    // 1줄: 주문번호/이름/금액 + 오른쪽 위 취소 버튼
    const headerDiv = document.createElement('div');
    headerDiv.className = 'order-card-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'order-card-title';
    titleSpan.textContent = `#${order.orderNumber} ${order.name}님 · ${order.totalPrice.toLocaleString()}원`;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-order-btn';
    cancelBtn.textContent = '취소';

    // 취소 버튼 클릭 시 confirm 확인 후 해당 주문 삭제
    cancelBtn.addEventListener('click', () => {
      const isConfirmed = confirm(`주문번호 #${order.orderNumber} (${order.name}님) 주문을 취소하시겠습니까?`);
      if (isConfirmed) {
        // 배열에서 해당 주문 번호 제외
        orders = orders.filter((item) => item.orderNumber !== order.orderNumber);
        orderCountBadge.textContent = orders.length; // 배지 갱신
        renderOrders(); // 화면 다시 그리기
      }
    });

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(cancelBtn);

    // 2줄: 음료, 사이즈, 옵션, 수량 (예: "카페라떼 M사이즈 (샷 추가) 1잔")
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'order-card-body';
    const optString = order.options.length > 0 ? ` (${order.options.join(', ')})` : '';
    bodyDiv.textContent = `${order.drink} ${order.size}사이즈${optString} ${order.quantity}잔`;

    // 3줄: 요청사항(있을 때만) · 주문 시간
    const footerDiv = document.createElement('div');
    footerDiv.className = 'order-card-footer';
    if (order.requests) {
      footerDiv.textContent = `${order.requests} · ${order.orderTime}`;
    } else {
      footerDiv.textContent = order.orderTime;
    }

    // 카드에 1~3줄 붙이기
    card.appendChild(headerDiv);
    card.appendChild(bodyDiv);
    card.appendChild(footerDiv);

    // 전체 목록에 카드 추가
    orderList.appendChild(card);
  });
}


// --------------------------------------------------------------------------
// 7. 내역 모두 지우기 버튼 이벤트
// --------------------------------------------------------------------------
clearAllBtn.addEventListener('click', () => {
  if (orders.length === 0) return;

  const isConfirmed = confirm('모든 주문 내역을 삭제하시겠습니까?');
  if (isConfirmed) {
    orders = []; // 배열 초기화
    orderCountBadge.textContent = '0'; // 배지 0으로 변경
    renderOrders(); // 목록 화면 다시 그리기
  }
});


// --------------------------------------------------------------------------
// 8. 다시 작성 버튼 (주문서 폼만 초기화, 주문 내역은 보존)
// --------------------------------------------------------------------------
orderForm.addEventListener('reset', function () {
  setTimeout(() => {
    // 기본 사이즈 M 복원
    const sizeM = document.getElementById('size-m');
    if (sizeM) sizeM.checked = true;

    // 수량 1로 복원
    quantityInput.value = 1;

    // 금액 재계산 (0원)
    calculateTotal();

    // 주문 확인 메시지 숨김
    orderConfirmation.textContent = '';
    orderConfirmation.hidden = true;
  }, 0);
});


// --------------------------------------------------------------------------
// 9. 초기 실행
// --------------------------------------------------------------------------
calculateTotal(); // 초기 금액(0원) 표시
renderOrders();   // 초기 주문 내역(빈 상태) 표시
