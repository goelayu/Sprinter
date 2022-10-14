package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"flag"
	"log"

	"github.com/go-echarts/go-echarts/v2/charts"
	"github.com/go-echarts/go-echarts/v2/components"
	"github.com/go-echarts/go-echarts/v2/opts"
)

var graphNodes = []opts.GraphNode{
	{Name: "Node1"},
	{Name: "Node2"},
	{Name: "Node3"},
	{Name: "Node4"},
	{Name: "Node5"},
	{Name: "Node6"},
	{Name: "Node7"},
	{Name: "Node8"},
}

func genLinks() []opts.GraphLink {
	links := make([]opts.GraphLink, 0)
	for i := 0; i < len(graphNodes); i++ {
		for j := 0; j < len(graphNodes); j++ {
			links = append(links, opts.GraphLink{Source: graphNodes[i].Name, Target: graphNodes[j].Name})
		}
	}
	return links
}

func graphBase() *charts.Graph {
	graph := charts.NewGraph()
	graph.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{Title: "basic graph example"}),
	)
	graph.AddSeries("graph", graphNodes, genLinks(),
		charts.WithGraphChartOpts(
			opts.GraphChart{Force: &opts.GraphForce{Repulsion: 8000}},
		),
	)
	return graph
}

func graphCircle() *charts.Graph {
	graph := charts.NewGraph()
	graph.SetGlobalOptions(
		charts.WithTitleOpts(opts.Title{Title: "Circular layout"}),
	)

	graph.AddSeries("graph", graphNodes, genLinks()).
		SetSeriesOptions(
			charts.WithGraphChartOpts(
				opts.GraphChart{
					Force:  &opts.GraphForce{Repulsion: 8000},
					Layout: "circular",
				}),
			charts.WithLabelOpts(opts.Label{Show: true, Position: "right"}),
		)
	return graph
}

func graphFromJSON(input string) *charts.Graph {
	graph := charts.NewGraph()
	graph.SetGlobalOptions(
		// charts.WithTitleOpts(opts.Title{
		// 	Title: "NW dependency",
		// }),
		charts.WithInitializationOpts(opts.Initialization{Width: "100%", Height: "95vh"}),
	)

	f, err := ioutil.ReadFile(input)
	if err != nil {
		panic(err)
	}

	type Data struct {
		Nodes []opts.GraphNode
		Links []opts.GraphLink
	}

	var data Data
	if err := json.Unmarshal(f, &data); err != nil {
		fmt.Println(err)
	}

	graph.AddSeries("graph", data.Nodes, data.Links).
		SetSeriesOptions(
			charts.WithLabelOpts(opts.Label{Color: "black", Position: "right"}),
			charts.WithGraphChartOpts(
				opts.GraphChart{
					Force:  &opts.GraphForce{EdgeLength: 250, Repulsion: 120},
					Layout: "force",
				}),
		)

		// .SetSeriesOptions(
		// 	charts.WithGraphChartOpts(opts.GraphChart{
		// 		Layout:             "none",
		// 		Roam:               true,
		// 		FocusNodeAdjacency: true,
		// 	}),
		// 	charts.WithEmphasisOpts(opts.Emphasis{
		// 		Label: &opts.Label{
		// 			Show:     true,
		// 			Color:    "black",
		// 			Position: "left",
		// 		},
		// 	}),
		// 	charts.WithLineStyleOpts(opts.LineStyle{
		// 		Curveness: 0.3,
		// 	}),
		// )
	return graph
}

type GraphExamples struct{}

func main() {
	input1 := flag.String("input1", "", "Input archive file")
	input2 := flag.String("input2", "", "Input archive file")
	output := flag.String("output", "", "Output archive file")

	flag.Parse()

	if *input1 == "" {
		log.Fatal("Missing input 1 file")
	}

	if *input2 == "" {
		log.Fatal("Missing input 2 file")
	}

	if *output == "" {
		log.Fatal("Missing output file")
	}

	page := components.NewPage()
	page.SetLayout(components.PageCenterLayout)

	page.AddCharts(
		graphFromJSON(*input1),
		graphFromJSON(*input2),
	)

	f, err := os.Create(*output)
	if err != nil {
		panic(err)

	}
	page.Render(io.MultiWriter(f))
}