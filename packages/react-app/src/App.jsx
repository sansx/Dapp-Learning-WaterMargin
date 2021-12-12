import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Switch, Route } from "react-router-dom";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { PrinterOutlined, FlagOutlined } from "@ant-design/icons";
import "./App.css";
import "antd/dist/antd.css";
import { Row, Col, Button, Alert, List, Card, Modal, InputNumber, Empty, message } from "antd";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { useUserAddress } from "eth-hooks";
import { format } from "date-fns";
import {
  useExchangePrice,
  useGasPrice,
  useUserProvider,
  useContractLoader,
  useContractReader,
  useEventListener,
  useBalance,
  useExternalContractLoader,
} from "./hooks";
import { Faucet, Ramp, Contract, GasGauge, Address, AddressInput } from "./components";
import { Transactor } from "./helpers";
import { formatEther, parseEther } from "@ethersproject/units";
import { BigNumber, utils } from "ethers";
//import Hints from "./Hints";
// import { Hints, ExampleUI, Subgraph } from "./views";
// import { useThemeSwitcher } from "react-css-theme-switcher";
import { INFURA_ID, DAI_ADDRESS, DAI_ABI, NETWORK, NETWORKS } from "./constants";
import StackGrid from "react-stack-grid";
import ReactJson from "react-json-view";
import assets from "./assets.js";
import { FireOutlined } from "@ant-design/icons";
import { useQuery } from "@apollo/client";
import getProof from "./utils/getMerkleTree";
import { dappLearningCollectibles, getCurrentColl } from "./gql";
import { Loading, useLoading } from "./components/Loading";
import { NFTImage } from "./components/Image";
import { NoData } from "./components/NoData";
import { Header, NavBar } from "./components/Header";

const { BufferList } = require("bl");
// https://www.npmjs.com/package/ipfs-http-client
const ipfsAPI = require("ipfs-http-client");
const ipfs = ipfsAPI({ host: "ipfs.infura.io", port: "5001", protocol: "https" });

console.log("📦 Assets: ", assets);

console.log("proof", getProof("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"));

/*
    Welcome to 🏗 scaffold-eth !

    Code:
    https://github.com/austintgriffith/scaffold-eth

    Support:
    https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA
    or DM @austingriffith on twitter or telegram

    You should get your own Infura.io ID and put it in `constants.js`
    (this is your connection to the main Ethereum network for ENS etc.)


    🌏 EXTERNAL CONTRACTS:
    You can also bring in contract artifacts in `constants.js`
    (and then use the `useExternalContractLoader()` hook!)
*/

/// 📡 What chain are your contracts deployed to?
const targetNetwork = NETWORKS["rinkeby"]; // <------- select your target frontend network (localhost, rinkeby, xdai, mainnet)

// 😬 Sorry for all the console logging
const DEBUG = false;

//EXAMPLE STARTING JSON:
const STARTING_JSON = {
  description: "It's actually a bison?",
  external_url: "https://austingriffith.com/portfolio/paintings/", // <-- this can link to a page for the specific file too
  image: "https://austingriffith.com/images/paintings/buffalo.jpg",
  name: "Buffalo",
  attributes: [
    {
      trait_type: "BackgroundColor",
      value: "green",
    },
    {
      trait_type: "Eyes",
      value: "googly",
    },
  ],
};

//helper function to "Get" from IPFS
// you usually go content.toString() after this...
// const getFromIPFS = async hashToGet => {
//   for await (const file of ipfs.get(hashToGet)) {
//     console.log(file.path);
//     if (!file.content) continue;
//     const content = new BufferList();
//     for await (const chunk of file.content) {
//       content.append(chunk);
//     }
//     console.log(content);
//     return content;
//   }
// };

// 🛰 providers
if (DEBUG) console.log("📡 Connecting to Mainnet Ethereum");
// const mainnetProvider = getDefaultProvider("mainnet", { infura: INFURA_ID, etherscan: ETHERSCAN_KEY, quorum: 1 });
// const mainnetProvider = new InfuraProvider("mainnet",INFURA_ID);
//
// attempt to connect to our own scaffold eth rpc and if that fails fall back to infura...
const scaffoldEthProvider = new JsonRpcProvider("https://rpc.scaffoldeth.io:48544");
const mainnetInfura = new JsonRpcProvider("https://mainnet.infura.io/v3/" + INFURA_ID);
// ( ⚠️ Getting "failed to meet quorum" errors? Check your INFURA_I

// 🏠 Your local provider is usually pointed at your local blockchain
const localProviderUrl = targetNetwork?.rpcUrl;
// as you deploy to other networks you can set REACT_APP_PROVIDER=https://dai.poa.network in packages/react-app/.env
const localProviderUrlFromEnv = process.env.REACT_APP_PROVIDER ? process.env.REACT_APP_PROVIDER : localProviderUrl;
if (DEBUG) console.log("🏠 Connecting to provider:", localProviderUrlFromEnv);
const localProvider = new JsonRpcProvider(localProviderUrlFromEnv);

// 🔭 block explorer URL
const blockExplorer = targetNetwork?.blockExplorer;

function App(props) {
  const mainnetProvider = scaffoldEthProvider && scaffoldEthProvider._network ? scaffoldEthProvider : mainnetInfura;
  if (DEBUG) console.log("🌎 mainnetProvider", mainnetProvider);

  const [injectedProvider, setInjectedProvider] = useState();
  /* 💵 This hook will get the price of ETH from 🦄 Uniswap: */
  const price = useExchangePrice(targetNetwork, mainnetProvider);

  /* 🔥 This hook will get the price of Gas from ⛽️ EtherGasStation */
  const gasPrice = useGasPrice(targetNetwork, "fast");
  // Use your injected provider from 🦊 Metamask or if you don't have it then instantly generate a 🔥 burner wallet.
  const userProvider = useUserProvider(injectedProvider, localProvider);
  let address = useUserAddress(userProvider);
  if (DEBUG) console.log("👩‍💼 selected address:", address);

  // You can warn the user if you would like them to be on a specific network
  let localChainId = localProvider && localProvider._network && localProvider._network.chainId;
  if (DEBUG) console.log("🏠 localChainId", localChainId);

  let selectedChainId = userProvider && userProvider._network && userProvider._network.chainId;
  if (DEBUG) console.log("🕵🏻‍♂️ selectedChainId:", selectedChainId);

  // For more hooks, check out 🔗eth-hooks at: https://www.npmjs.com/package/eth-hooks

  // The transactor wraps transactions and provides notificiations
  const tx = Transactor(userProvider, gasPrice);

  // Faucet Tx can be used to send funds from the faucet
  const faucetTx = Transactor(localProvider, gasPrice);

  // 🏗 scaffold-eth is full of handy hooks like this one to get your balance:
  const yourLocalBalance = useBalance(localProvider, address);
  if (DEBUG) console.log("💵 yourLocalBalance", yourLocalBalance ? formatEther(yourLocalBalance) : "...");

  // Just plug in different 🛰 providers to get your balance on different chains:
  const yourMainnetBalance = useBalance(mainnetProvider, address);
  if (DEBUG) console.log("💵 yourMainnetBalance", yourMainnetBalance ? formatEther(yourMainnetBalance) : "...");

  // Load in your local 📝 contract and read a value from it:
  const readContracts = useContractLoader(localProvider);
  if (DEBUG) console.log("📝 readContracts", readContracts);

  // If you want to make 🔐 write transactions to your contracts, use the userProvider:
  const writeContracts = useContractLoader(userProvider);
  if (DEBUG) console.log("🔐 writeContracts", writeContracts);

  // EXTERNAL CONTRACT EXAMPLE:
  //
  // If you want to bring in the mainnet DAI contract it would look like:
  const mainnetDAIContract = useExternalContractLoader(mainnetProvider, DAI_ADDRESS, DAI_ABI);
  if (DEBUG) console.log("🌍 DAI contract on mainnet:", mainnetDAIContract);
  //
  // Then read your DAI balance like:
  const myMainnetDAIBalance = useContractReader({ DAI: mainnetDAIContract }, "DAI", "balanceOf", [
    "0x34aA3F359A9D614239015126635CE7732c18fDF3",
  ]);
  if (DEBUG) console.log("🥇 myMainnetDAIBalance:", myMainnetDAIBalance);

  // keep track of a variable from the contract in the local React state:
  const balance = useContractReader(readContracts, "DappLearningCollectible", "balanceOf", [address]);
  if (DEBUG) console.log("🤗 balance:", balance);

  const auctionAddress = readContracts?.AuctionFixedPrice?.address;

  const weth_balance = useContractReader(readContracts, "WETH", "allowance", [address, auctionAddress]);
  // console.log("weth_balance", weth_balance);
  if (DEBUG) console.log("🤗 balance:", balance);

  const isInclaimList = useContractReader(readContracts, "DappLearningCollectible", "claimedBitMap", [address]);

  if (DEBUG) console.log("isInclaimList", isInclaimList);

  const isApproved = useContractReader(readContracts, "DappLearningCollectible", "isApprovedForAll", [
    address,
    auctionAddress,
  ]);

  if (DEBUG) console.log("isApproved", isApproved);

  //📟 Listen for broadcast events
  const transferEvents = useEventListener(readContracts, "DappLearningCollectible", "Transfer", localProvider, 1);
  if (DEBUG) console.log("📟 Transfer events:", transferEvents);

  const [modalVisible, setModalVisible] = useState(false);
  const [auctionDetails, setAuctionDetails] = useState({ price: "", duration: "" });
  const [auctionToken, setAuctionToken] = useState("");
  //
  // 🧠 This effect will update yourCollectibles by polling when your balance changes
  //
  // const yourBalance = balance && balance.toNumber && balance.toNumber();
  const [yourCollectibles, setYourCollectibles] = useState();

  /*
  const addressFromENS = useResolveName(mainnetProvider, "austingriffith.eth");
  console.log("🏷 Resolved austingriffith.eth as:",addressFromENS)
  */

  const [networkDisplay, setNetwork] = useState("")
  // console.log("selectedChainId=====", selectedChainId);
  // console.log("localChainId=====", localChainId);
  useEffect(() => {
    if (localChainId && selectedChainId && localChainId != selectedChainId) {
      message.warn(`You are selected to choose ${NETWORK(selectedChainId)?.name || "Unknown Network"} Network, you should choose ${targetNetwork?.name} Network`)
      setNetwork(NETWORK(selectedChainId)?.name || "Unknown")
    } else {
      setNetwork(targetNetwork?.name)
    }
  }, [localChainId, selectedChainId, targetNetwork])

  const loadWeb3Modal = useCallback(async () => {
    const provider = await web3Modal.connect();
    setInjectedProvider(new Web3Provider(provider));
  }, [setInjectedProvider]);

  useEffect(() => {
    if (web3Modal.cachedProvider) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  let faucetHint = "";
  const faucetAvailable =
    localProvider &&
    localProvider.connection &&
    localProvider.connection.url &&
    localProvider.connection.url.indexOf(window.location.hostname) >= 0 &&
    !process.env.REACT_APP_PROVIDER &&
    price > 1;

  const [faucetClicked, setFaucetClicked] = useState(false);
  //if(!faucetClicked&&localProvider&&localProvider._network&&localProvider._network.chainId==31337&&yourLocalBalance&&formatEther(yourLocalBalance)<=0){
  if (
    !faucetClicked &&
    localProvider &&
    localProvider._network &&
    yourLocalBalance &&
    formatEther(yourLocalBalance) <= 0
  ) {
    faucetHint = (
      <div>
        <Button
          type={"primary"}
          onClick={() => {
            faucetTx({
              to: address,
              value: parseEther("0.01"),
            });
            setFaucetClicked(true);
          }}
        >
          💰 Grab funds from the faucet ⛽️
        </Button>
      </div>
    );
  }

  const [yourJSON, setYourJSON] = useState(STARTING_JSON);
  const [sending, setSending] = useState();
  const [ipfsHash, setIpfsHash] = useState();
  const [ipfsDownHash, setIpfsDownHash] = useState();
  const { openLoading, closeLoading, loading: load } = useLoading();

  const [downloading, setDownloading] = useState();
  const [ipfsContent, setIpfsContent] = useState();
  const [yourBid, setYourBid] = useState({});
  const [galleryList, setGalleryList] = useState([]);
  const [timer, setTimer] = useState();
  const [id_rank, setId_rank] = useState();
  let assetKeys = Object.keys(assets);

  const { loading, error, data } = useQuery(dappLearningCollectibles, {
    pollInterval: 800,
  });
  // const { loading, error, data } = useQuery(getCurrentColl);
  const currentColl = useQuery(getCurrentColl, {
    variables: { address: address },
    pollInterval: 800,
  });

  const [transferToAddresses, setTransferToAddresses] = useState({});

  const [loadedAssets, setLoadedAssets] = useState();

  useEffect(() => {
    try {
      // Fix an issue where an error in the following code causes the page to crash
      setId_rank(JSON.parse(localStorage.getItem("id_rank")) || {});
    } catch (error) {
      console.log(error);
    }
    return () => {
      localStorage.setItem("id_rank", JSON.stringify(id_rank));
    };
  }, []);

  useEffect(() => {
    if (data) {
      clearInterval(timer);
      setTimer(
        setInterval(() => {
          updateYourCollectibles();
        }, 1000),
      );
    }
  }, [data, readContracts]);

  // console.log(utils.id(Object.keys(assets)[0]));
  // useEffect(() => {
  //   // useQuery(dappLearningCollectibles)
  //   (async () => {
  //     // let res = await readContracts.DappLearningCollectible.claimedBitMap;
  //     console.log(readContracts.DappLearningCollectible);
  //   })();
  // }, []);

  // const updateYourCollectibles = async () => {
  //   let assetUpdate = [];
  //   let assetKeys = Object.keys(assets);
  //   try {
  //     let forSaleArr = await Promise.all(assetKeys.map(a => readContracts.YourCollectible.forSale(utils.id(a))));
  //     assetUpdate = await Promise.all(
  //       assetKeys.map((id, idx) => {
  //         const forSale = forSaleArr[idx];
  //         if (forSale) return Promise.resolve({ id, ...assets[id], forSale });
  //         return new Promise((res, rej) => {
  //           readContracts.YourCollectible.uriToTokenId(utils.id(id)).then(tokenId => {
  //             let getOwner = readContracts.YourCollectible.ownerOf(tokenId);
  //             const nftAddress = readContracts.YourCollectible.address;
  //             let getAuctionInfo = readContracts.Auction.getTokenAuctionDetails(nftAddress, tokenId);
  //             Promise.all([getOwner, getAuctionInfo]).then(([owner, auctionInfo]) => {
  //               res({ id, ...assets[id], forSale, owner, auctionInfo });
  //             });
  //           });
  //         });
  //       }),
  //     );
  //   } catch (error) {
  //     console.log(error);
  //   }
  //   setLoadedAssets(assetUpdate);
  // };

  const updateYourCollectibles = async () => {
    let assetUpdate = [];
    if (!readContracts) return;
    try {
      // let forSaleArr = await Promise.all(assetKeys.map(a => readContracts.YourCollectible.forSale(utils.id(a))));
      let forSaleArr = data?.dappLearningCollectibles?.map(a => a.isAuction);
      let wait_arr = [];
      let res = await Promise.all(
        data?.dappLearningCollectibles
          ?.filter(e => !Object.keys(id_rank).includes(e.tokenId))
          .map(e => {
            wait_arr.push(e.tokenId);
            return readContracts.DappLearningCollectible.tokenURI(e.tokenId);
          }),
      );
      let new_obj = { ...id_rank };
      wait_arr.map((e, idx) => (new_obj[e] = res[idx]));
      wait_arr.length > 0 && setId_rank({ ...new_obj });
      let ranked_res = data?.dappLearningCollectibles?.map((e, i) => ({
        ...e,
        rank: new_obj[e.tokenId],
      }));
      // console.log(res);
      assetUpdate = await Promise.all(
        ranked_res.map((e, idx) => {
          const forSale = forSaleArr[idx];
          if (!forSale) return Promise.resolve({ id: assetKeys[idx], ...assets[assetKeys[e.rank]], forSale, ...e });
          return new Promise((res, rej) => {
            const { tokenId, owner } = ranked_res[idx];
            const nftAddress = readContracts.DappLearningCollectible.address;
            readContracts.AuctionFixedPrice.getTokenAuctionDetails(nftAddress, tokenId).then(auctionInfo => {
              res({ id: assetKeys[idx], ...assets[assetKeys[e.rank]], forSale, owner, auctionInfo, ...e });
            });
          });
        }),
      );
    } catch (error) {
      console.log(error);
    }
    setLoadedAssets(assetUpdate);
  };

  // useEffect(() => {
  //   if (readContracts && readContracts.YourCollectible) updateYourCollectibles();
  // }, [assets, readContracts, transferEvents]);
  // let galleryList = [];

  useEffect(() => {
    openLoading();
    if (!address || !loadedAssets) return;
    let list = [];
    setGalleryList(null);
    for (let a in loadedAssets ? loadedAssets.slice(0, 6) : []) {
      let { auctionInfo, owner, id, forSale, name, external_url, image, description, isAuction } = loadedAssets[a];

      let cardActions = [];
      let auctionDetails = [];
      auctionDetails.push(null);
      const deadline = new Date(auctionInfo?.duration * 1000);
      const isEnded = deadline <= new Date();
      const btnStyle = { marginBottom: "0px" };
      let isActive, seller, price, maxBidUser, maxBid;
      if (auctionInfo) {
        isActive = auctionInfo.isActive;
        seller = auctionInfo.seller;
        price = auctionInfo.price;
        maxBidUser = auctionInfo.maxBidUser;
        maxBid = auctionInfo.maxBid;
      }
      // const { isActive, seller, price, maxBidUser, maxBid } = auctionInfo;
      // address = address * 1;
      // owner = owner * 1;

      cardActions.push(
        <div className="cardAction" key={id}>
          <div className="actionBox">
            {isAuction && weth_balance < price && (
              <>
                <Button
                  style={btnStyle}
                  block
                  type="primary"
                  onClick={() => approveWETH()}
                // disabled={address * 1 !== owner * 1}
                >
                  <FlagOutlined />
                  Approve my WETH
                </Button>
              </>
            )}
            {!isAuction && address * 1 === owner * 1 && (
              <>
                <Button
                  style={btnStyle}
                  block
                  type="primary"
                  onClick={() => (!isApproved ? approveAll() : startAuction(id))}
                  disabled={address * 1 !== owner * 1}
                >
                  <FlagOutlined />
                  {!isApproved ? "Approve this collectible" : "Start auction"}
                </Button>
              </>
            )}
            {/* isActive && address === seller */}
            {isAuction && !isEnded && weth_balance >= price && (
              <Button style={btnStyle} block ghost type="primary" onClick={() => completeAuction(id, price)}>
                I want this
              </Button>
            )}
            {isAuction && address === seller && (
              <>
                <Button
                  style={{ ...btnStyle, fontWeight: "bold" }}
                  block
                  danger
                  type="text"
                  onClick={() => cancelAuction(id)}
                >
                  <FireOutlined />
                  Cancel
                </Button>
              </>
            )}
          </div>
          {/* {!loadedAssets[a].auctionInfo.isActive && address === loadedAssets[a].owner && <><Button style={{ marginBottom: "10px" }} onClick={startAuction(loadedAssets[a].id)} disabled={address !== loadedAssets[a].owner}>Start auction</Button><br/></>}
          {loadedAssets[a].auctionInfo.isActive && address === loadedAssets[a].auctionInfo.seller && <><Button style={{ marginBottom: "10px" }} onClick={completeAuction(loadedAssets[a].id)}>Complete auction</Button><br/></>}
          {loadedAssets[a].auctionInfo.isActive && address === loadedAssets[a].auctionInfo.seller && <><Button style={{ marginBottom: "10px" }} onClick={cancelAuction(loadedAssets[a].id)}>Cancel auction</Button><br/></>} */}
        </div>,
      );

      auctionDetails.push(
        isAuction ? (
          <div style={{ marginTop: "4px", textAlign: "left" }} key={id}>
            <div style={{ fontWeight: "bold", display: "flex", padding: "0 8px" }}>
              <span style={{ flex: 1 }}>{!isEnded ? `in progress` : "ended"}</span>
              <span>
                price: <span style={{ color: "rgb(24, 144, 255)", fontSize: "16px" }}>{utils.formatEther(price)}</span>{" "}
                WETH
              </span>
            </div>
            <div style={{ marginBottom: 4, padding: "0 8px" }}>
              {!isEnded ? `Auction ends at ${format(deadline, "MMMM dd, hh:mm:ss")}` : ""}
            </div>
            {/* <div>
              {maxBidUser === constants.AddressZero ? (
                "Highest bid was not made yet"
              ) : (
                <div>
                  Highest bid by:{" "}
                  <Address
                    address={maxBidUser}
                    ensProvider={mainnetProvider}
                    blockExplorer={blockExplorer}
                    minimized={true}
                  />
                  <p>{utils.formatEther(maxBid)} ETH</p>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", marginTop: "20px" }}>
                <p style={{ margin: 0, marginRight: "15px" }}>Your bid in ETH: </p>
                <InputNumber
                  placeholder="0.1"
                  value={yourBid[id]}
                  onChange={newBid => setYourBid({ ...yourBid, [id]: newBid })}
                  style={{ flexGrow: 1 }}
                />
              </div>
              <Button
                style={{ marginTop: "7px" }}
                onClick={() => placeBid(id, yourBid[id])}
                disabled={!yourBid[id] || isEnded}
              >
                Place a bid
              </Button>
            </div> */}
          </div>
        ) : (
          <div style={{ minHeight: "50px", marginTop: "4px", padding: "0 8px", textAlign: "left" }}>
            {!isApproved && "if you want start an auction, you should approve this collectible🙌"}
          </div>
        ),
      );

      list.push(
        <div key={name} className={"cardBox"}>
          <NFTImage image={image} />
          <div
            style={{
              opacity: 0.77,
              padding: "16px 10px 5px",
              fontSize: "16px",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {description}
            {owner && (
              <Address
                address={owner}
                size={6}
                disableBlockies
                ensProvider={mainnetProvider}
                blockExplorer={blockExplorer}
                minimized={false}
                fontSize={16}
              />
            )}
          </div>
          {auctionDetails}
          <div>{cardActions}</div>
        </div>,
      );
    }
    closeLoading();
    setGalleryList([...list]);
  }, [loadedAssets, address]);

  const startAuction = tokenUri => {
    setAuctionToken(tokenUri);
    setModalVisible(true);
  };

  const placeBid = async (tokenId, ethAmount) => {
    // const tokenId = await readContracts.YourCollectible.uriToTokenId(utils.id(tokenUri));
    const nftAddress = writeContracts.DappLearningCollectible.address;
    await tx(
      writeContracts.AuctionFixedPrice.bid(nftAddress, tokenId, {
        value: parseEther(ethAmount.toString()),
      }),
    );
    // updateYourCollectibles();
  };

  const approveAll = async () => {
    try {
      const auctionAddress = readContracts.AuctionFixedPrice.address;
      await writeContracts.DappLearningCollectible.setApprovalForAll(auctionAddress, true);
    } catch (error) { }
  };

  const approveWETH = async () => {
    try {
      const auctionAddress = readContracts.AuctionFixedPrice.address;
      await tx(writeContracts.WETH.approve(auctionAddress, BigNumber.from("0xffffffffffffffffffffffffffffffff")));
      // const auctionAddress = readContracts.AuctionFixedPrice.address;
      // const allowance = await readContracts.WETH.allowance(address, auctionAddress);
      // if (allowance.lt(price)) {

      // }
    } catch (err) { }
  };

  const completeAuction = async (tokenId, price) => {
    // const tokenId = await readContracts.YourCollectible.uriToTokenId(utils.id(tokenUri));
    // return console.log(price);

    // check balance
    // const balance = await readContracts.WETH.balanceOf(address);
    // console.warn(balance.toString());
    // if (balance < price) {
    //   // TODO: alert not enough money
    //   return;
    // }
    const nftAddress = readContracts.DappLearningCollectible.address;
    await tx(writeContracts.AuctionFixedPrice.purchaseNFTToken(nftAddress, tokenId), { gasPrice, gasLimit: 1000000 });
    // updateYourCollectibles();
  };

  const cancelAuction = async tokenId => {
    const nftAddress = readContracts.DappLearningCollectible.address;
    await tx(writeContracts.AuctionFixedPrice.cancelAution(nftAddress, tokenId));
  };

  const handleOk = async () => {
    setModalVisible(false);
    const { price, duration } = auctionDetails;
    const tokenId = auctionToken;

    const auctionAddress = readContracts.AuctionFixedPrice.address;
    const nftAddress = readContracts.DappLearningCollectible.address;
    const WETH_Address = readContracts.WETH.address;

    try {
      // let res1 = await writeContracts.DappLearningCollectible.setApprovalForAll(auctionAddress, false);
      // return console.log(res1);
      const isApproved = await readContracts.DappLearningCollectible.isApprovedForAll(address, auctionAddress);
      console.log(isApproved);
      if (!isApproved) {
        let res = await writeContracts.DappLearningCollectible.setApprovalForAll(auctionAddress, true);
        return console.log(res);
      }

      const ethPrice = utils.parseEther(price.toString());
      const blockDuration = Math.floor(new Date().getTime() / 1000) + duration;

      await tx(
        writeContracts.AuctionFixedPrice.createTokenAuction(
          nftAddress,
          tokenId,
          WETH_Address,
          ethPrice,
          blockDuration,
          {
            gasPrice,
          },
        ),
      );
      const auctionInfo = await readContracts.AuctionFixedPrice.getTokenAuctionDetails(nftAddress, tokenId);
      console.log("auctionInfo", { auctionInfo });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = () => {
    setModalVisible(false);
  };

  return (
    <div className="App">
      <Modal
        title="Start auction"
        visible={modalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okButtonProps={{ disabled: !auctionDetails.price || !auctionDetails.duration }}
        okText="Start"
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <p style={{ margin: 0, marginRight: "15px" }}>ETH price (minimal bid): </p>
          <InputNumber
            placeholder="0.1"
            value={auctionDetails.price}
            onChange={newPrice => setAuctionDetails({ ...auctionDetails, price: newPrice })}
            style={{ flexGrow: 1 }}
          />
        </div>
        <br />
        <div style={{ display: "flex", alignItems: "center" }}>
          <p style={{ margin: 0, marginRight: "15px" }}>Duration in seconds: </p>
          <InputNumber
            placeholder="3600"
            value={auctionDetails.duration}
            onChange={newDuration => setAuctionDetails({ ...auctionDetails, duration: newDuration })}
            style={{ flexGrow: 1 }}
          />
        </div>
      </Modal>

      {/* ✏️ Edit the header and change the title to your project name */}
      <Header
        address={address}
        localProvider={localProvider}
        userProvider={userProvider}
        mainnetProvider={mainnetProvider}
        price={price}
        web3Modal={web3Modal}
        loadWeb3Modal={loadWeb3Modal}
        logoutOfWeb3Modal={logoutOfWeb3Modal}
        blockExplorer={blockExplorer}
        networkDisplay={networkDisplay}
        targetNetwork={targetNetwork}
      />
      <BrowserRouter>
        <NavBar />
        <Switch>
          <Route exact path="/">
            {/*
                🎛 this scaffolding is full of commonly used components
                this <Contract/> component will automatically parse your ABI
                and give you a form to interact with it locally
            */}

            <div style={{ maxWidth: "1280", margin: "auto", marginTop: 32, paddingBottom: 108 }}>
              {/* <Button
                disabled={galleryList.length === 0}
                onClick={updateYourCollectibles}
                style={{ marginBottom: "25px" }}
              >
                Update collectibles
              </Button> */}

              {galleryList?.length ? (
                <StackGrid columnWidth={416} gutterWidth={16} gutterHeight={32}>
                  {galleryList}
                </StackGrid>
              ) : !load ? (
                <NoData style={{ marginTop: 50 }} />
              ) : null}
            </div>
          </Route>

          <Route path="/yourcollectibles">
            <div style={{ width: 640, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
              {isInclaimList !== undefined && !isInclaimList && (
                <Button
                  block
                  disabled={address && getProof(address).length === 0}
                  onClick={() => {
                    // console.log("gasPrice,", gasPrice);
                    // console.log(ethers.BigNumber.from(window.crypto.getRandomValues(new Uint32Array(1))[0]));
                    // console.log("mintItem=======", id);
                    // console.log(address, getProof(address));
                    tx(
                      writeContracts.DappLearningCollectible.mintItem(
                        window.crypto.getRandomValues(new Uint32Array(1))[0],
                        getProof(address),
                      ),
                    );
                  }}
                >
                  <PrinterOutlined />
                  Mint
                </Button>
              )}
              <List
                bordered
                // dataSource={yourCollectibles}
                dataSource={currentColl?.data?.dappLearningCollectibles}
                renderItem={item => {
                  item = { ...item, ...assets[assetKeys[id_rank[item.tokenId]]] };
                  // const id = item.id.toNumber();
                  const id = id_rank[item.tokenId] * 1;
                  return (
                    <List.Item key={id + "_" + item.uri + "_" + item.owner}>
                      <Card
                        title={
                          <div>
                            <span style={{ fontSize: 16, marginRight: 8 }}>#{id}</span> {item.name}
                          </div>
                        }
                      >
                        <div>
                          <img src={item.image} style={{ maxWidth: 150 }} />
                        </div>
                        <div>{item.description}</div>
                      </Card>

                      <div>
                        owner:{" "}
                        <Address
                          address={item.owner}
                          ensProvider={mainnetProvider}
                          blockExplorer={blockExplorer}
                          fontSize={16}
                        />
                        <AddressInput
                          ensProvider={mainnetProvider}
                          placeholder="transfer to address"
                          value={transferToAddresses[id]}
                          onChange={newValue => {
                            let update = {};
                            update[id] = newValue;
                            setTransferToAddresses({ ...transferToAddresses, ...update });
                          }}
                        />
                        <Button
                          onClick={() => {
                            console.log("writeContracts", writeContracts);
                            tx(
                              writeContracts.DappLearningCollectible.transferFrom(address, transferToAddresses[id], id),
                            );
                          }}
                        >
                          Transfer
                        </Button>
                      </div>
                    </List.Item>
                  );
                }}
              />
            </div>
          </Route>

          <Route path="/transfers">
            <div style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
              <List
                bordered
                dataSource={transferEvents}
                renderItem={item => {
                  console.log(item)
                  return (
                    <List.Item key={item[0] + "_" + item[1] + "_" + item.blockNumber + "_" + item[2].toNumber()}>
                      <span style={{ fontSize: 16, marginRight: 8 }}>#{item[2].toNumber()}</span>
                      <Address address={item[0]} ensProvider={mainnetProvider} fontSize={16} /> {"=>"}
                      <Address address={item[1]} ensProvider={mainnetProvider} fontSize={16} />
                    </List.Item>
                  );
                }}
              />
            </div>
          </Route>

          <Route path="/ipfsup">
            <div style={{ paddingTop: 32, width: 740, margin: "auto", textAlign: "left" }}>
              <ReactJson
                style={{ padding: 8 }}
                src={yourJSON}
                theme={"pop"}
                enableClipboard={false}
                onEdit={(edit, a) => {
                  setYourJSON(edit.updated_src);
                }}
                onAdd={(add, a) => {
                  setYourJSON(add.updated_src);
                }}
                onDelete={(del, a) => {
                  setYourJSON(del.updated_src);
                }}
              />
            </div>

            <Button
              style={{ margin: 8 }}
              loading={sending}
              size="large"
              shape="round"
              type="primary"
              onClick={async () => {
                console.log("UPLOADING...", yourJSON);
                setSending(true);
                setIpfsHash();
                const result = await ipfs.add(JSON.stringify(yourJSON)); //addToIPFS(JSON.stringify(yourJSON))
                if (result && result.path) {
                  setIpfsHash(result.path);
                }
                setSending(false);
                console.log("RESULT:", result);
              }}
            >
              Upload to IPFS
            </Button>

            <div style={{ padding: 16, paddingBottom: 150 }}>{ipfsHash}</div>
          </Route>
          <Route path="/debugcontracts">
            <Contract
              name="YourCollectible"
              signer={userProvider.getSigner()}
              provider={localProvider}
              address={address}
              blockExplorer={blockExplorer}
            />
          </Route>
        </Switch>
      </BrowserRouter>

      {/* <ThemeSwitch /> */}

      {/* 🗺 Extra UI like gas price, eth price, faucet, and support: */}
      {/* <div style={{ position: "fixed", textAlign: "left", left: 0, bottom: 20, padding: 10, zIndex: 90 }}>
        <Row align="middle" gutter={[4, 4]}>
          <Col span={8}>
            <Ramp price={price} address={address} networks={NETWORKS} />
          </Col>

          <Col span={8} style={{ textAlign: "center", opacity: 0.8 }}>
            <GasGauge gasPrice={gasPrice} />
          </Col>
          <Col span={8} style={{ textAlign: "center", opacity: 1 }}>
            <Button
              onClick={() => {
                window.open("https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA");
              }}
              size="large"
              shape="round"
            >
              <span style={{ marginRight: 8 }} role="img" aria-label="support">
                💬
              </span>
              Support
            </Button>
          </Col>
        </Row>

        <Row align="middle" gutter={[4, 4]}>
          <Col span={24}>
            {
              /*  if the local provider has a signer, let's show the faucet:  * /
              faucetAvailable ? (
                <Faucet localProvider={localProvider} price={price} ensProvider={mainnetProvider} />
              ) : (
                ""
              )
            }
          </Col>
        </Row>
      </div>
       */}
      <Loading />
    </div>
  );
}

/*
  Web3 modal helps us "connect" external wallets:
*/
const web3Modal = new Web3Modal({
  // network: "mainnet", // optional
  cacheProvider: true, // optional
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: INFURA_ID,
      },
    },
  },
});

const logoutOfWeb3Modal = async () => {
  await web3Modal.clearCachedProvider();
  setTimeout(() => {
    window.location.reload();
  }, 1);
};

window.ethereum &&
  window.ethereum.on("chainChanged", chainId => {
    setTimeout(() => {
      window.location.reload();
    }, 1);
  });

export default App;
