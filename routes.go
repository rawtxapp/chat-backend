package main

import (
	"github.com/ant0ine/go-json-rest/rest"
	"github.com/lightningnetwork/lnd/lnrpc"
	"golang.org/x/net/context"
)

func getInvoice(w rest.ResponseWriter, r *rest.Request) {
	c, clean := getClient()
	defer clean()

	memo := r.PathParam("memo")
	res, err := c.AddInvoice(context.Background(), &lnrpc.Invoice{
		Memo:  memo,
		Value: 100,
	})
	if err != nil {
		w.WriteJson(map[string]string{"error": err.Error()})
		return
	}
	w.WriteJson(map[string]string{"pay_req": res.PaymentRequest})
}

func getPubkey(w rest.ResponseWriter, r *rest.Request) {
	c, clean := getClient()
	defer clean()

	res, err := c.GetInfo(context.Background(), &lnrpc.GetInfoRequest{})
	if err != nil {
		w.WriteJson(map[string]string{"error": err.Error()})
		return
	}
	j := map[string]string{"pubkey": res.GetIdentityPubkey()}
	if len(res.GetUris()) > 0 {
		j["uri"] = res.GetUris()[0]
	}
	w.WriteJson(j)
}
