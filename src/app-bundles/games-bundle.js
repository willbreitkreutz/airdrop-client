// eslint-disable-next-line no-undef
const apiRoot = __API_ROOT__;

export default {
  name: "games",

  state: {
    joinedGame: null,
    games: [],
    socket: null,
  },

  getGames: (state) => state.games.games,

  getGamesByJoinCode: (state) => {
    const games = state.games.games;
    const gamesByJoinCode = {};
    games.forEach((game) => {
      gamesByJoinCode[game.join_code] = game;
    });
    return gamesByJoinCode;
  },

  getJoinedGame: (state) => state.games.joinedGame,

  getSocket: (state) => state.games.socket,

  getIsSocketOpen: (state) => {
    const socket = state.games.socket;
    return !!socket;
  },

  clearCurrentGame:
    () =>
    ({ set }) => {
      set({
        joinedGame: null,
        socket: null,
      });
    },

  loadGames:
    () =>
    ({ store, set }) => {
      const token = store.getToken();
      if (!token) return null;
      fetch(`${apiRoot}/games`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (res.status === 200) {
            return res.json();
          } else {
            throw new Error("Failed to load games");
          }
        })
        .then((data) => {
          set({
            games: data,
          });
        });
    },

  joinGame:
    (game) =>
    ({ store, set, fire }) => {
      const joinedGame = store.getJoinedGame();
      const { join_code } = game;

      // sort circuit if already joined
      if (joinedGame === join_code) return null;

      set({ joinedGame: join_code });
      const token = store.getToken();
      fetch(`${apiRoot}/auth/ws-token?joinCode=${join_code}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
        })
        .then((data) => {
          const socketToken = data.wsToken;
          const soc = new WebSocket(
            `${apiRoot.replace(
              "http",
              "ws"
            )}/soc?channel=${join_code}&wsToken=${socketToken}`
          );
          soc.onopen = () => {
            set({
              socket: soc,
            });
            fire("socket-opened");
            fire("game-joined");
          };
          soc.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (!data || !data.type)
              return console.log("invalid message received", data);
            switch (data.type) {
              case "USER_LOCATION_UPDATE":
                fire("user-location-update", data.payload);
                break;
              case "PRIZE_POINT":
                fire("new-prize-point", data.payload);
                break;
              case "PRIZE_CLAIMED":
                fire("prize-claimed", data.payload);
                break;
              default:
                console.log("unknown message received", data);
            }
          };
          soc.onerror = () => {
            store.clearCurrentGame();
          };
          soc.onclose = () => {
            store.clearCurrentGame();
          };
        })
        .catch((error) => {
          console.error(error);
        });
    },

  init: ({ store }) => {
    store.loadGames();
    store.on("login", () => {
      store.loadGames();
    });
    store.on("logout", () => {
      store.clearCurrentGame();
    });
  },
};
