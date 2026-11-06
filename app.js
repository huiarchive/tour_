import { saveSelectedArea, getSelectedArea, toggleFavorite, getFavorites } from "./firebase.js";

// ⚠️ 공공데이터포털 Decoding(디코딩) 일반 인증키를 입력하세요[cite: 2, 4]
const TOUR_API_KEY = "b2d8f3d6a6dd0e285169d5ad17955894fbbc64c9aabbcfb3f97529b7525159b2";

const areaSelect = document.getElementById("areaSelect");
const tourGrid = document.getElementById("tourGrid");
const loading = document.getElementById("loading");
const statusInfo = document.getElementById("statusInfo");

let currentItems = [];

// 1. 초기 페이지 로드 시 Firestore에 저장된 이전 지역 확인[cite: 2]
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const savedData = await getSelectedArea();
    if (savedData && savedData.areaCode) {
      areaSelect.value = savedData.areaCode;
      statusInfo.textContent = `Firestore에서 이전 저장 지역 [${savedData.areaName}] 정보를 로드했습니다.`;
      await fetchAndRenderTourData(savedData.areaCode, savedData.areaName);
    } else {
      tourGrid.classList.add("hidden");
      statusInfo.textContent = "저장된 지역 정보가 없습니다. 지역을 선택해주세요.";
    }
  } catch (err) {
    console.error(err);
    tourGrid.classList.add("hidden");
  }
});

// 2. 드롭다운 선택 변경 시 API 호출 & Firestore 업데이트[cite: 2]
areaSelect.addEventListener("change", async (e) => {
  const areaCode = e.target.value;
  const areaName = e.target.options[e.target.selectedIndex].text;

  if (!areaCode) {
    tourGrid.classList.add("hidden");
    statusInfo.textContent = "";
    return;
  }

  await fetchAndRenderTourData(areaCode, areaName);
  await saveSelectedArea(areaCode, areaName);
});

// 3. 한국관광공사 TourAPI 2.0 호출[cite: 2, 4]
async function fetchAndRenderTourData(areaCode, areaName) {
  showLoading(true);
  tourGrid.innerHTML = "";

  const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${encodeURIComponent(TOUR_API_KEY)}&numOfRows=20&pageNo=1&MobileOS=ETC&MobileApp=AppTest&_type=json&arrange=A&areaCode=${areaCode}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    let items = data.response?.body?.items?.item || [];

    if (!Array.isArray(items)) items = [items];

    if (items.length === 0) {
      statusInfo.textContent = `[${areaName}] 지역의 데이터가 없습니다.`;
      tourGrid.classList.add("hidden");
      return;
    }

    currentItems = items;
    statusInfo.textContent = `현재 지역: ${areaName} (총 ${items.length}건)`;
    await renderCards();
  } catch (error) {
    console.error("API 연동 에러:", error);
    statusInfo.textContent = "관광 정보를 불러오는 중 오류가 발생했습니다.";
    tourGrid.classList.add("hidden");
  } finally {
    showLoading(false);
  }
}

// 4. 시각화 카드 목록 렌더링 & 찜 상태 동기화[cite: 2]
async function renderCards() {
  const favoritesMap = await getFavorites();
  tourGrid.innerHTML = "";

  currentItems.forEach((item) => {
    let imageUrl = item.firstimage || "https://via.placeholder.com/400x260?text=No+Image";
    if (imageUrl.startsWith("http://")) imageUrl = imageUrl.replace("http://", "https://");

    const contentId = String(item.contentid);
    const isFav = !!favoritesMap[contentId];

    const card = document.createElement("article");
    card.className = "bg-white rounded-xl shadow border border-slate-100 overflow-hidden flex flex-col justify-between hover:shadow-md transition";
    card.innerHTML = `
      <div class="relative aspect-video bg-slate-200">
        <img src="${imageUrl}" alt="${item.title}" class="w-full h-44 object-cover" onError="this.src='https://via.placeholder.com/400x260?text=Image+Error'" />
        <button class="fav-btn absolute top-2 right-2 bg-white/80 p-2 rounded-full shadow hover:scale-110 transition">
          ${isFav ? "❤️" : "🤍"}
        </button>
      </div>
      <div class="p-4">
        <h2 class="font-bold text-slate-800 line-clamp-1">${item.title}</h2>
        <p class="text-xs text-slate-500 mt-1 line-clamp-2">📍 ${item.addr1 || "주소 미제공"}</p>
      </div>
    `;

    // 찜하기 버튼 클릭 처리[cite: 2]
    card.querySelector(".fav-btn").addEventListener("click", async (e) => {
      const isAdded = await toggleFavorite(item);
      e.target.textContent = isAdded ? "❤️" : "🤍";
    });

    tourGrid.appendChild(card);
  });

  tourGrid.classList.remove("hidden");
}

function showLoading(bool) {
  loading.classList.toggle("hidden", !bool);
}
